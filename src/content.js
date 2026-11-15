const DEFAULT_SETTINGS = {
  slotStart: "21:00",
  slotEnd: "23:59",
  autoAcceptEnabled: false,
  autoAcceptRemainingSec: 20,
  audioEnabled: true,
  audioVolume: 1,
  doubtSoundId: "ding.mp3",
  toggleSoundId: "alert.mp3",
};
const BUILTIN_SOUNDS = ["ding.mp3", "alert.mp3"];
const TOGGLE_ID_FALLBACK = "#mat-mdc-slide-toggle-1-button";
const SLOT_CHECK_MS = 30_000;
const RESTORE_DELAY_MS = 1000;
const DOUBT_DEBOUNCE_MS = 300;
const DOUBT_ACCEPT_WINDOW_SEC = 90;
const MIN_REMAINING_SEC = 20;
const MAX_REMAINING_SEC = 80;
const LOG_PREFIX = "[DoubtTracker]";

let slotStart = DEFAULT_SETTINGS.slotStart;
let slotEnd = DEFAULT_SETTINGS.slotEnd;
let autoAcceptEnabled = DEFAULT_SETTINGS.autoAcceptEnabled;
let autoAcceptRemainingSec = DEFAULT_SETTINGS.autoAcceptRemainingSec;
let watching = false;
let waitingForReady = false;
let watchedBtn = null;
let toggleObserver = null;
let doubtObserver = null;
let remountObserver = null;
let slotTimer = null;
let doubtDebounceTimer = null;
let autoAcceptTimer = null;
let lastHadAcceptReject = false;

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function clampVolume(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return DEFAULT_SETTINGS.audioVolume;
  return Math.min(1, Math.max(0, n));
}

async function loadAudioPlaySettings() {
  const [syncData, localData] = await Promise.all([
    chrome.storage.sync.get({
      audioEnabled: DEFAULT_SETTINGS.audioEnabled,
      audioVolume: DEFAULT_SETTINGS.audioVolume,
      doubtSoundId: DEFAULT_SETTINGS.doubtSoundId,
      toggleSoundId: DEFAULT_SETTINGS.toggleSoundId,
    }),
    chrome.storage.local.get({ customAudios: [] }),
  ]);

  return {
    audioEnabled: syncData.audioEnabled ?? DEFAULT_SETTINGS.audioEnabled,
    audioVolume: clampVolume(syncData.audioVolume ?? DEFAULT_SETTINGS.audioVolume),
    doubtSoundId: syncData.doubtSoundId || DEFAULT_SETTINGS.doubtSoundId,
    toggleSoundId: syncData.toggleSoundId || DEFAULT_SETTINGS.toggleSoundId,
    customAudios: Array.isArray(localData.customAudios) ? localData.customAudios : [],
  };
}

function resolveSoundSrc(soundId, customAudios, fallbackId) {
  if (BUILTIN_SOUNDS.includes(soundId)) {
    return chrome.runtime.getURL(soundId);
  }

  const custom = customAudios.find((t) => t.id === soundId);
  if (custom?.dataUrl) return custom.dataUrl;

  return chrome.runtime.getURL(fallbackId);
}

function resolveAlertSrc(sound, settings) {
  if (sound === "toggle") {
    return resolveSoundSrc(
      settings.toggleSoundId,
      settings.customAudios,
      DEFAULT_SETTINGS.toggleSoundId,
    );
  }
  if (sound === "doubt") {
    return resolveSoundSrc(
      settings.doubtSoundId,
      settings.customAudios,
      DEFAULT_SETTINGS.doubtSoundId,
    );
  }
  return null;
}

function requestOffscreenFallback(sound) {
  try {
    chrome.runtime.sendMessage({ type: "PLAY_ALERT", sound }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // Extension context invalidated — ignore
  }
}

async function playAlert(sound) {
  try {
    const settings = await loadAudioPlaySettings();
    if (!settings.audioEnabled) {
      log("play skipped (muted)", sound);
      return;
    }

    const src = resolveAlertSrc(sound, settings);
    if (!src) {
      log("play skipped (unknown sound)", sound);
      return;
    }

    log("play in page", sound, { volume: settings.audioVolume });
    const audio = new Audio(src);
    audio.volume = settings.audioVolume;
    await audio.play();
  } catch (err) {
    log("in-page play failed, falling back to offscreen", err?.message || err);
    requestOffscreenFallback(sound);
  }
}

function parseTimeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isWithinSlot(now = new Date()) {
  const current = now.getHours() * 60 + now.getMinutes();
  const start = parseTimeToMinutes(slotStart);
  const end = parseTimeToMinutes(slotEnd);
  return current >= start && current <= end;
}

function clampRemainingSec(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return DEFAULT_SETTINGS.autoAcceptRemainingSec;
  return Math.min(MAX_REMAINING_SEC, Math.max(MIN_REMAINING_SEC, Math.round(n)));
}

function findTakeDoubtToggle() {
  for (const toggle of document.querySelectorAll("mat-slide-toggle")) {
    const labeledBy = toggle.getAttribute("aria-labelledby");
    const ariaLabel = toggle.getAttribute("aria-label") || "";
    const labelText = labeledBy ? document.getElementById(labeledBy)?.textContent || "" : "";
    const nearby = toggle.parentElement?.textContent || "";
    const haystack = `${ariaLabel} ${labelText} ${nearby} ${toggle.textContent || ""}`;

    if (/take\s*doubt/i.test(haystack)) {
      const btn =
        toggle.querySelector('button[role="switch"]') ||
        toggle.querySelector("button.mdc-switch") ||
        toggle.querySelector("button");
      if (btn) return btn;
    }
  }

  return document.querySelector(TOGGLE_ID_FALLBACK);
}

function waitForDocumentComplete() {
  if (document.readyState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
  });
}

function waitForReady() {
  return new Promise((resolve) => {
    const existing = findTakeDoubtToggle();
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const btn = findTakeDoubtToggle();
      if (btn) {
        observer.disconnect();
        resolve(btn);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

function pageContainsAcceptReject() {
  const el = document.querySelector("mentor-assigned-doubt");
  if (!el) return false;

  const text = el.innerText.trim();
  return text.includes("Accept") || text.includes("Reject");
}

function findAcceptButton() {
  const root = document.querySelector("mentor-assigned-doubt");
  if (!root) return null;

  const candidates = root.querySelectorAll("button, a, [role='button']");
  for (const el of candidates) {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (/^accept$/i.test(text)) return el;
  }

  return null;
}

function clearAutoAcceptTimer() {
  if (autoAcceptTimer) {
    clearTimeout(autoAcceptTimer);
    autoAcceptTimer = null;
  }
}

function scheduleAutoAccept() {
  clearAutoAcceptTimer();
  if (!autoAcceptEnabled) {
    log("auto-accept skipped (disabled)");
    return;
  }

  const remaining = clampRemainingSec(autoAcceptRemainingSec);
  const delayMs = Math.max(0, (DOUBT_ACCEPT_WINDOW_SEC - remaining) * 1000);
  const delaySec = delayMs / 1000;

  log(`auto-accept scheduled in ${delaySec}s (accept when ${remaining}s remaining)`);

  autoAcceptTimer = setTimeout(() => {
    autoAcceptTimer = null;
    if (!autoAcceptEnabled) {
      log("auto-accept skipped (disabled)");
      return;
    }
    if (!pageContainsAcceptReject()) {
      log("auto-accept skipped (ui gone)");
      return;
    }

    const acceptBtn = findAcceptButton();
    if (acceptBtn?.isConnected) {
      acceptBtn.click();
      log("AUTO ACCEPTED");
    } else {
      log("auto-accept skipped (no button)");
    }
  }, delayMs);
}

function evaluateDoubtPresence({ source }) {
  const hasAcceptReject = pageContainsAcceptReject();

  log("evaluateDoubtPresence", {
    source,
    hasAcceptReject,
    lastHadAcceptReject,
    watching,
    autoAcceptPending: Boolean(autoAcceptTimer),
  });

  if (!lastHadAcceptReject && hasAcceptReject) {
    log("NEW DOUBT detected — playing sound, scheduling auto-accept");
    playAlert("doubt");
    scheduleAutoAccept();
  } else if (lastHadAcceptReject && !hasAcceptReject) {
    log("Accept UI gone — clearing auto-accept timer");
    clearAutoAcceptTimer();
  } else if (source === "visibility" && hasAcceptReject && autoAcceptEnabled && !autoAcceptTimer) {
    log("visibility re-arm — Accept UI present, no pending timer");
    scheduleAutoAccept();
  }

  lastHadAcceptReject = hasAcceptReject;
}

function stopWatchers() {
  clearAutoAcceptTimer();

  if (toggleObserver) {
    toggleObserver.disconnect();
    toggleObserver = null;
  }
  if (doubtObserver) {
    doubtObserver.disconnect();
    doubtObserver = null;
  }
  if (remountObserver) {
    remountObserver.disconnect();
    remountObserver = null;
  }
  if (doubtDebounceTimer) {
    clearTimeout(doubtDebounceTimer);
    doubtDebounceTimer = null;
  }
  watching = false;
  watchedBtn = null;
  lastHadAcceptReject = false;
  log("stopWatchers");
}

function watchToggleButton(btn) {
  let lastState = btn.classList.contains("mdc-switch--checked");
  let isRestoring = false;

  toggleObserver = new MutationObserver(() => {
    if (!btn.isConnected) return;

    const currentState = btn.classList.contains("mdc-switch--checked");

    if (lastState && !currentState && !isRestoring) {
      isRestoring = true;
      log("Take Doubt toggled OFF — restoring");
      playAlert("toggle");

      setTimeout(() => {
        if (btn.isConnected && !btn.classList.contains("mdc-switch--checked")) {
          btn.click();
        }
        lastState = true;
        isRestoring = false;
      }, RESTORE_DELAY_MS);
      return;
    }

    if (!isRestoring) {
      lastState = currentState;
    }
  });

  toggleObserver.observe(btn, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

function watchNewDoubts() {
  lastHadAcceptReject = pageContainsAcceptReject();
  log("watchNewDoubts start", { lastHadAcceptReject });

  doubtObserver = new MutationObserver(() => {
    if (doubtDebounceTimer) clearTimeout(doubtDebounceTimer);

    doubtDebounceTimer = setTimeout(() => {
      doubtDebounceTimer = null;
      evaluateDoubtPresence({ source: "mutation" });
    }, DOUBT_DEBOUNCE_MS);
  });

  doubtObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function watchForRemount(btn) {
  const rebootstrap = () => {
    log("toggle disconnected, re-bootstrapping");
    stopWatchers();
    // Defer so we are not blocked by waitingForReady still true inside bootstrapAfterReady
    setTimeout(() => bootstrapAfterReady(), 0);
  };

  remountObserver = new MutationObserver(() => {
    if (btn.isConnected) return;
    rebootstrap();
  });

  remountObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  if (!btn.isConnected) {
    rebootstrap();
  }
}

function startWatchers(btn) {
  stopWatchers();
  watching = true;
  watchedBtn = btn;
  log("startWatchers", { inSlot: isWithinSlot() });
  watchToggleButton(btn);
  watchNewDoubts();
  watchForRemount(btn);
}

function syncWatchingState() {
  const inSlot = isWithinSlot();
  const btn = findTakeDoubtToggle();

  if (watching && watchedBtn && !watchedBtn.isConnected) {
    log("syncWatchingState: watched toggle disconnected");
    stopWatchers();
    if (!btn) {
      if (!waitingForReady) bootstrapAfterReady();
      return;
    }
  }

  if (!btn) {
    if (watching) stopWatchers();
    if (!waitingForReady) bootstrapAfterReady();
    return;
  }

  if (inSlot && !watching) {
    startWatchers(btn);
  } else if (!inSlot && watching) {
    log("syncWatchingState: outside slot");
    stopWatchers();
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    log("tab hidden");
    return;
  }

  log("tab visible, re-checking doubt");
  if (!watching) return;
  evaluateDoubtPresence({ source: "visibility" });
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  slotStart = stored.slotStart || DEFAULT_SETTINGS.slotStart;
  slotEnd = stored.slotEnd || DEFAULT_SETTINGS.slotEnd;
  autoAcceptEnabled = Boolean(stored.autoAcceptEnabled);
  autoAcceptRemainingSec = clampRemainingSec(
    stored.autoAcceptRemainingSec ?? DEFAULT_SETTINGS.autoAcceptRemainingSec,
  );
}

async function bootstrapAfterReady() {
  if (waitingForReady) return;
  waitingForReady = true;
  log("bootstrapAfterReady: waiting for Take Doubt toggle");

  try {
    const btn = await waitForReady();
    if (!isWithinSlot()) {
      log("bootstrapAfterReady: outside slot, not starting watchers");
      return;
    }
    startWatchers(btn);
  } finally {
    waitingForReady = false;
  }
}

async function init() {
  log("init");
  await waitForDocumentComplete();
  await loadSettings();
  log("settings loaded", {
    slotStart,
    slotEnd,
    autoAcceptEnabled,
    autoAcceptRemainingSec,
    inSlot: isWithinSlot(),
  });
  await bootstrapAfterReady();

  if (slotTimer) clearInterval(slotTimer);
  slotTimer = setInterval(syncWatchingState, SLOT_CHECK_MS);

  document.addEventListener("visibilitychange", onVisibilityChange);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes.slotStart) {
      slotStart = changes.slotStart.newValue || DEFAULT_SETTINGS.slotStart;
    }
    if (changes.slotEnd) {
      slotEnd = changes.slotEnd.newValue || DEFAULT_SETTINGS.slotEnd;
    }
    if (changes.autoAcceptEnabled) {
      autoAcceptEnabled = Boolean(changes.autoAcceptEnabled.newValue);
      if (!autoAcceptEnabled) clearAutoAcceptTimer();
    }
    if (changes.autoAcceptRemainingSec) {
      autoAcceptRemainingSec = clampRemainingSec(changes.autoAcceptRemainingSec.newValue);
    }

    log("settings changed", {
      slotStart,
      slotEnd,
      autoAcceptEnabled,
      autoAcceptRemainingSec,
    });
    syncWatchingState();
  });
}

init();

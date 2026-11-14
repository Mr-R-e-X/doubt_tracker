const DEFAULT_SETTINGS = {
  slotStart: "21:00",
  slotEnd: "23:59",
  autoAcceptEnabled: false,
  autoAcceptRemainingSec: 20
};
const TOGGLE_ID_FALLBACK = "#mat-mdc-slide-toggle-1-button";
const SLOT_CHECK_MS = 30_000;
const RESTORE_DELAY_MS = 1000;
const DOUBT_DEBOUNCE_MS = 300;
const DOUBT_ACCEPT_WINDOW_SEC = 90;
const MIN_REMAINING_SEC = 20;
const MAX_REMAINING_SEC = 80;

let slotStart = DEFAULT_SETTINGS.slotStart;
let slotEnd = DEFAULT_SETTINGS.slotEnd;
let autoAcceptEnabled = DEFAULT_SETTINGS.autoAcceptEnabled;
let autoAcceptRemainingSec = DEFAULT_SETTINGS.autoAcceptRemainingSec;
let watching = false;
let waitingForReady = false;
let toggleObserver = null;
let doubtObserver = null;
let remountObserver = null;
let slotTimer = null;
let doubtDebounceTimer = null;
let autoAcceptTimer = null;
let lastHadAcceptReject = false;

function playAlert(sound) {
  chrome.runtime.sendMessage({ type: "PLAY_ALERT", sound });
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
    const labelText = labeledBy
      ? document.getElementById(labeledBy)?.textContent || ""
      : "";
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
      subtree: true
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
  if (!autoAcceptEnabled) return;

  const remaining = clampRemainingSec(autoAcceptRemainingSec);
  const delayMs = Math.max(0, (DOUBT_ACCEPT_WINDOW_SEC - remaining) * 1000);

  autoAcceptTimer = setTimeout(() => {
    autoAcceptTimer = null;
    if (!autoAcceptEnabled || !pageContainsAcceptReject()) return;

    const acceptBtn = findAcceptButton();
    if (acceptBtn?.isConnected) {
      acceptBtn.click();
      console.log("AUTO ACCEPTED DOUBT");
    }
  }, delayMs);
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
  lastHadAcceptReject = false;
}

function watchToggleButton(btn) {
  let lastState = btn.classList.contains("mdc-switch--checked");
  let isRestoring = false;

  toggleObserver = new MutationObserver(() => {
    if (!btn.isConnected) return;

    const currentState = btn.classList.contains("mdc-switch--checked");

    if (lastState && !currentState && !isRestoring) {
      isRestoring = true;
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
    attributeFilter: ["class"]
  });
}

function watchNewDoubts() {
  lastHadAcceptReject = pageContainsAcceptReject();

  doubtObserver = new MutationObserver(() => {
    if (doubtDebounceTimer) clearTimeout(doubtDebounceTimer);

    doubtDebounceTimer = setTimeout(() => {
      const hasAcceptReject = pageContainsAcceptReject();

      if (!lastHadAcceptReject && hasAcceptReject) {
        playAlert("doubt");
        console.log("AN INCOMING DOUBT...");
        scheduleAutoAccept();
      }

      if (lastHadAcceptReject && !hasAcceptReject) {
        clearAutoAcceptTimer();
      }

      lastHadAcceptReject = hasAcceptReject;
    }, DOUBT_DEBOUNCE_MS);
  });

  doubtObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function watchForRemount(btn) {
  remountObserver = new MutationObserver(() => {
    if (btn.isConnected) return;

    stopWatchers();
    bootstrapAfterReady();
  });

  remountObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function startWatchers(btn) {
  stopWatchers();
  watching = true;
  watchToggleButton(btn);
  watchNewDoubts();
  watchForRemount(btn);
}

function syncWatchingState() {
  const inSlot = isWithinSlot();
  const btn = findTakeDoubtToggle();

  if (!btn) {
    if (watching) stopWatchers();
    if (!waitingForReady) bootstrapAfterReady();
    return;
  }

  if (inSlot && !watching) {
    startWatchers(btn);
  } else if (!inSlot && watching) {
    stopWatchers();
  }
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  slotStart = stored.slotStart || DEFAULT_SETTINGS.slotStart;
  slotEnd = stored.slotEnd || DEFAULT_SETTINGS.slotEnd;
  autoAcceptEnabled = Boolean(stored.autoAcceptEnabled);
  autoAcceptRemainingSec = clampRemainingSec(
    stored.autoAcceptRemainingSec ?? DEFAULT_SETTINGS.autoAcceptRemainingSec
  );
}

async function bootstrapAfterReady() {
  if (waitingForReady) return;
  waitingForReady = true;

  try {
    const btn = await waitForReady();
    if (!isWithinSlot()) return;
    startWatchers(btn);
  } finally {
    waitingForReady = false;
  }
}

async function init() {
  await waitForDocumentComplete();
  await loadSettings();
  await bootstrapAfterReady();

  if (slotTimer) clearInterval(slotTimer);
  slotTimer = setInterval(syncWatchingState, SLOT_CHECK_MS);

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
      autoAcceptRemainingSec = clampRemainingSec(
        changes.autoAcceptRemainingSec.newValue
      );
    }

    syncWatchingState();
  });
}

init();

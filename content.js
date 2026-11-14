const DEFAULT_SLOT = { slotStart: "21:00", slotEnd: "23:59" };
const TOGGLE_ID_FALLBACK = "#mat-mdc-slide-toggle-1-button";
const SLOT_CHECK_MS = 30_000;
const RESTORE_DELAY_MS = 1000;
const DOUBT_DEBOUNCE_MS = 300;

let slotStart = DEFAULT_SLOT.slotStart;
let slotEnd = DEFAULT_SLOT.slotEnd;
let watching = false;
let waitingForReady = false;
let toggleObserver = null;
let doubtObserver = null;
let remountObserver = null;
let slotTimer = null;
let doubtDebounceTimer = null;
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

function stopWatchers() {
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

async function loadSlotSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SLOT);
  slotStart = stored.slotStart || DEFAULT_SLOT.slotStart;
  slotEnd = stored.slotEnd || DEFAULT_SLOT.slotEnd;
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
  await loadSlotSettings();
  await bootstrapAfterReady();

  if (slotTimer) clearInterval(slotTimer);
  slotTimer = setInterval(syncWatchingState, SLOT_CHECK_MS);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes.slotStart) {
      slotStart = changes.slotStart.newValue || DEFAULT_SLOT.slotStart;
    }
    if (changes.slotEnd) {
      slotEnd = changes.slotEnd.newValue || DEFAULT_SLOT.slotEnd;
    }

    syncWatchingState();
  });
}

init();

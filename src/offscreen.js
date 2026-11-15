const LOG_PREFIX = "[DoubtTracker]";

const SOUND_FILES = {
  toggle: "alert.mp3",
  doubt: "ding.mp3",
};

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Ignore content-script broadcasts; only play when relayed by the service worker
  if (msg.type !== "PLAY_ALERT" || sender.tab) return;

  const file = SOUND_FILES[msg.sound];
  if (!file) return;

  log("play", file);
  const audio = new Audio(chrome.runtime.getURL(file));
  audio.play().catch((err) => log("play failed", err?.message || err));
});

log("offscreen loaded, sending OFFSCREEN_READY");
chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" }, () => {
  void chrome.runtime.lastError;
});

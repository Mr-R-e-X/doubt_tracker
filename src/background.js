const LOG_PREFIX = "[DoubtTracker]";

let offscreenReady = false;
let waitingForOffscreenReady = false;
let pendingSound = null;
let creatingOffscreen = null;

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function sendPlay(sound) {
  log("play", sound);
  chrome.runtime.sendMessage({ type: "PLAY_ALERT", sound }, () => {
    void chrome.runtime.lastError;
  });
}

function flushPendingSound() {
  if (!pendingSound || !offscreenReady) return;
  const sound = pendingSound;
  pendingSound = null;
  log("flush pending", sound);
  sendPlay(sound);
}

async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) {
    // Long-lived document after SW restart — listener is already registered.
    // Do not mark ready while a fresh create is still waiting for OFFSCREEN_READY.
    if (!waitingForOffscreenReady && !creatingOffscreen) {
      offscreenReady = true;
    }
    return;
  }

  offscreenReady = false;
  waitingForOffscreenReady = true;
  log("offscreen create");

  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: "src/offscreen.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play alert sound",
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }

  await creatingOffscreen;
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "OFFSCREEN_READY") {
    log("OFFSCREEN_READY");
    waitingForOffscreenReady = false;
    offscreenReady = true;
    flushPendingSound();
    return;
  }

  if (msg.type !== "PLAY_ALERT" || !sender.tab) return;

  log("PLAY_ALERT received", msg.sound);
  pendingSound = msg.sound;

  ensureOffscreen().then(() => {
    if (offscreenReady) {
      flushPendingSound();
    }
  });
});

const LOG_PREFIX = "[DoubtTracker]";
const OFFSCREEN_READY_TIMEOUT_MS = 1000;
const BUILTIN_SOUNDS = ["ding.mp3", "alert.mp3"];
const TOGGLE_SOUND_FILE = "alert.mp3";

const AUDIO_DEFAULTS = {
  audioEnabled: true,
  audioVolume: 1,
  doubtSoundId: "ding.mp3",
};

let offscreenReady = false;
let waitingForOffscreenReady = false;
let pendingPlay = null;
let creatingOffscreen = null;
let readyTimeoutId = null;

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function clampVolume(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return AUDIO_DEFAULTS.audioVolume;
  return Math.min(1, Math.max(0, n));
}

async function seedAudioDefaults() {
  const stored = await chrome.storage.sync.get([
    "audioEnabled",
    "audioVolume",
    "doubtSoundId",
  ]);

  const patch = {};
  if (!Object.hasOwn(stored, "audioEnabled")) {
    patch.audioEnabled = AUDIO_DEFAULTS.audioEnabled;
  }
  if (!Object.hasOwn(stored, "audioVolume")) {
    patch.audioVolume = AUDIO_DEFAULTS.audioVolume;
  }
  if (!Object.hasOwn(stored, "doubtSoundId")) {
    patch.doubtSoundId = AUDIO_DEFAULTS.doubtSoundId;
  }

  if (Object.keys(patch).length === 0) return;
  await chrome.storage.sync.set(patch);
  log("seeded audio defaults", patch);
}

async function resolvePlayPayload(sound) {
  const [syncData, localData] = await Promise.all([
    chrome.storage.sync.get(AUDIO_DEFAULTS),
    chrome.storage.local.get({ customAudios: [] }),
  ]);

  const audioEnabled = syncData.audioEnabled ?? AUDIO_DEFAULTS.audioEnabled;
  const volume = clampVolume(syncData.audioVolume ?? AUDIO_DEFAULTS.audioVolume);
  const doubtSoundId = syncData.doubtSoundId || AUDIO_DEFAULTS.doubtSoundId;
  const customAudios = Array.isArray(localData.customAudios) ? localData.customAudios : [];

  if (!audioEnabled) {
    return { enabled: false, volume, src: null, sound };
  }

  let src = null;
  if (sound === "toggle") {
    src = chrome.runtime.getURL(TOGGLE_SOUND_FILE);
  } else if (sound === "doubt") {
    if (BUILTIN_SOUNDS.includes(doubtSoundId)) {
      src = chrome.runtime.getURL(doubtSoundId);
    } else {
      const custom = customAudios.find((t) => t.id === doubtSoundId);
      src = custom?.dataUrl || chrome.runtime.getURL(AUDIO_DEFAULTS.doubtSoundId);
    }
  }

  return { enabled: true, volume, src, sound };
}

function clearReadyTimeout() {
  if (readyTimeoutId) {
    clearTimeout(readyTimeoutId);
    readyTimeoutId = null;
  }
}

function markOffscreenReady(reason) {
  clearReadyTimeout();
  waitingForOffscreenReady = false;
  offscreenReady = true;
  log("offscreen ready", reason);
  flushPendingPlay();
}

function sendPlayPayload(payload) {
  log("play relay", payload.sound, { volume: payload.volume });
  chrome.runtime.sendMessage(
    {
      type: "PLAY_ALERT",
      sound: payload.sound,
      volume: payload.volume,
      src: payload.src,
    },
    () => {
      void chrome.runtime.lastError;
    },
  );
}

function flushPendingPlay() {
  if (!pendingPlay || !offscreenReady) return;
  const payload = pendingPlay;
  pendingPlay = null;
  log("flush pending", payload.sound);
  sendPlayPayload(payload);
}

function armReadyTimeout() {
  clearReadyTimeout();
  readyTimeoutId = setTimeout(() => {
    readyTimeoutId = null;
    if (offscreenReady) return;
    log("OFFSCREEN_READY timeout — forcing ready");
    markOffscreenReady("timeout");
  }, OFFSCREEN_READY_TIMEOUT_MS);
}

async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) {
    if (!waitingForOffscreenReady && !creatingOffscreen) {
      offscreenReady = true;
    }
    return;
  }

  offscreenReady = false;
  waitingForOffscreenReady = true;
  log("offscreen create");
  armReadyTimeout();

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

async function handlePlayAlert(sound) {
  const payload = await resolvePlayPayload(sound);
  if (!payload.enabled) {
    log("play skipped (muted)", sound);
    return;
  }
  if (!payload.src) {
    log("play skipped (unknown sound)", sound);
    return;
  }

  pendingPlay = payload;
  await ensureOffscreen();
  if (offscreenReady) {
    flushPendingPlay();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  seedAudioDefaults().catch((err) => log("seed onInstalled failed", err?.message || err));
  ensureOffscreen().catch((err) => log("warmup onInstalled failed", err?.message || err));
});

seedAudioDefaults().catch((err) => log("seed on startup failed", err?.message || err));
ensureOffscreen().catch((err) => log("warmup on startup failed", err?.message || err));

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "OFFSCREEN_READY") {
    markOffscreenReady("message");
    return;
  }

  if (msg.type !== "PLAY_ALERT") return;
  // Content-script fallback or popup test only — ignore SW→offscreen relays (no tab, no test)
  if (!sender.tab && !msg.test) return;

  log("PLAY_ALERT received", msg.sound, msg.test ? "(test)" : "(fallback)");
  handlePlayAlert(msg.sound).catch((err) => log("handlePlayAlert failed", err?.message || err));
});

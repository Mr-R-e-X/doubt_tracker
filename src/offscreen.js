const LOG_PREFIX = "[DoubtTracker]";
const LOAD_TIMEOUT_MS = 3000;

const BUILTIN_SOUNDS = ["ding.mp3", "alert.mp3"];
const TOGGLE_SOUND_FILE = "alert.mp3";
const AUDIO_DEFAULTS = {
  audioEnabled: true,
  audioVolume: 1,
  doubtSoundId: "ding.mp3",
};

let audioEnabled = AUDIO_DEFAULTS.audioEnabled;
let audioVolume = AUDIO_DEFAULTS.audioVolume;
let doubtSoundId = AUDIO_DEFAULTS.doubtSoundId;
let customAudios = [];

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function clampVolume(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return AUDIO_DEFAULTS.audioVolume;
  return Math.min(1, Math.max(0, n));
}

async function loadAudioSettings() {
  const [syncData, localData] = await Promise.all([
    chrome.storage.sync.get(AUDIO_DEFAULTS),
    chrome.storage.local.get({ customAudios: [] }),
  ]);

  audioEnabled = syncData.audioEnabled ?? AUDIO_DEFAULTS.audioEnabled;
  audioVolume = clampVolume(syncData.audioVolume ?? AUDIO_DEFAULTS.audioVolume);
  doubtSoundId = syncData.doubtSoundId || AUDIO_DEFAULTS.doubtSoundId;
  customAudios = Array.isArray(localData.customAudios) ? localData.customAudios : [];
}

function resolveDoubtSrc() {
  if (BUILTIN_SOUNDS.includes(doubtSoundId)) {
    return chrome.runtime.getURL(doubtSoundId);
  }

  const custom = customAudios.find((t) => t.id === doubtSoundId);
  if (custom?.dataUrl) return custom.dataUrl;

  log("doubt sound missing, falling back to ding.mp3", doubtSoundId);
  return chrome.runtime.getURL(AUDIO_DEFAULTS.doubtSoundId);
}

function resolveSrc(sound) {
  if (sound === "toggle") {
    return chrome.runtime.getURL(TOGGLE_SOUND_FILE);
  }
  if (sound === "doubt") {
    return resolveDoubtSrc();
  }
  return null;
}

function waitForCanPlay(audio) {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("canplaythrough", done);
      audio.removeEventListener("loadeddata", done);
      audio.removeEventListener("error", done);
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(done, LOAD_TIMEOUT_MS);
    audio.addEventListener("canplaythrough", done, { once: true });
    audio.addEventListener("loadeddata", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    audio.load();
  });
}

async function playWithSrc(src, volume, soundLabel) {
  if (!src) {
    log("play skipped (no src)", soundLabel);
    return;
  }

  const vol = clampVolume(volume);
  log("play", soundLabel || "payload", { volume: vol, src: src.slice(0, 80) });
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = src;
  audio.volume = vol;

  await waitForCanPlay(audio);
  audio.play().catch((err) => log("play failed", err?.message || err));
}

async function playSound(sound) {
  try {
    await loadAudioSettings();
  } catch (err) {
    log("settings load failed, using defaults", err?.message || err);
  }

  if (!audioEnabled) {
    log("play skipped (muted)", sound);
    return;
  }

  const src = resolveSrc(sound);
  await playWithSrc(src, audioVolume, sound);
}

function announceReady() {
  log("offscreen ready", { audioEnabled, audioVolume, doubtSoundId });
  chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" }, () => {
    void chrome.runtime.lastError;
  });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Ignore content-script broadcasts; only play when relayed by the service worker
  if (msg.type !== "PLAY_ALERT" || sender.tab) return;

  // Prefer explicit payload from SW (volume + src)
  if (msg.src) {
    playWithSrc(msg.src, msg.volume ?? AUDIO_DEFAULTS.audioVolume, msg.sound);
    return;
  }

  playSound(msg.sound);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    if (changes.audioEnabled) {
      audioEnabled = changes.audioEnabled.newValue ?? AUDIO_DEFAULTS.audioEnabled;
    }
    if (changes.audioVolume) {
      audioVolume = clampVolume(changes.audioVolume.newValue);
    }
    if (changes.doubtSoundId) {
      doubtSoundId = changes.doubtSoundId.newValue || AUDIO_DEFAULTS.doubtSoundId;
    }
  }

  if (area === "local" && changes.customAudios) {
    customAudios = Array.isArray(changes.customAudios.newValue)
      ? changes.customAudios.newValue
      : [];
  }
});

(async () => {
  try {
    await loadAudioSettings();
  } catch (err) {
    log("initial settings load failed", err?.message || err);
  } finally {
    announceReady();
  }
})();

const DEFAULTS = {
  slotStart: "21:00",
  slotEnd: "23:59",
  autoAcceptEnabled: false,
  autoAcceptRemainingSec: 20,
  audioEnabled: true,
  audioVolume: 1,
  doubtSoundId: "ding.mp3",
};

const BUILTIN_SOUNDS = ["ding.mp3", "alert.mp3"];
const MIN_REMAINING_SEC = 20;
const MAX_REMAINING_SEC = 80;
const MAX_CUSTOM_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_CUSTOM_AUDIOS = 3;

const startInput = document.getElementById("slotStart");
const endInput = document.getElementById("slotEnd");
const autoAcceptEnabledInput = document.getElementById("autoAcceptEnabled");
const autoAcceptRemainingInput = document.getElementById("autoAcceptRemainingSec");
const autoAcceptOptions = document.getElementById("autoAcceptOptions");
const audioEnabledInput = document.getElementById("audioEnabled");
const audioOptions = document.getElementById("audioOptions");
const audioVolumeInput = document.getElementById("audioVolume");
const audioVolumeLabel = document.getElementById("audioVolumeLabel");
const doubtSoundSelect = document.getElementById("doubtSoundId");
const customAudioFileInput = document.getElementById("customAudioFile");
const pickAudioBtn = document.getElementById("pickAudioBtn");
const customAudioListEl = document.getElementById("customAudioList");
const testAudioBtn = document.getElementById("testAudioBtn");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

const AUDIO_PERSIST_DEBOUNCE_MS = 180;

let customAudios = [];
let previewAudio = null;
let audioPersistTimer = null;

function parseTimeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isWithinSlot(start, end, now = new Date()) {
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= parseTimeToMinutes(start) && current <= parseTimeToMinutes(end);
}

function clampVolume(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return DEFAULTS.audioVolume;
  return Math.min(1, Math.max(0, n));
}

function setStatus(start, end, extra) {
  const active = isWithinSlot(start, end);
  statusEl.textContent = extra || (active ? "Active now" : "Outside slot");
  statusEl.className = `status ${extra ? "saved" : active ? "active" : "outside"}`;
}

function flashStatus(message, kind = "saved") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`;
  setTimeout(() => setStatus(startInput.value, endInput.value), 1500);
}

function syncAutoAcceptOptionsVisibility() {
  autoAcceptOptions.hidden = !autoAcceptEnabledInput.checked;
}

function syncAudioUI() {
  audioOptions.hidden = !audioEnabledInput.checked;
  audioVolumeLabel.textContent = `${Math.round(clampVolume(audioVolumeInput.value) * 100)}%`;
}

async function persistAudioSettings() {
  const audioEnabled = audioEnabledInput.checked;
  const audioVolume = clampVolume(audioVolumeInput.value);
  let doubtSoundId = doubtSoundSelect.value;
  if (!isValidSoundId(doubtSoundId)) {
    doubtSoundId = DEFAULTS.doubtSoundId;
    doubtSoundSelect.value = doubtSoundId;
  }

  audioVolumeInput.value = audioVolume;
  await chrome.storage.sync.set({ audioEnabled, audioVolume, doubtSoundId });
}

function persistAudioSettingsDebounced() {
  if (audioPersistTimer) clearTimeout(audioPersistTimer);
  audioPersistTimer = setTimeout(() => {
    audioPersistTimer = null;
    persistAudioSettings().catch(() => {});
  }, AUDIO_PERSIST_DEBOUNCE_MS);
}

function isValidSoundId(id) {
  return BUILTIN_SOUNDS.includes(id) || customAudios.some((t) => t.id === id);
}

function renderDoubtSoundOptions(selectedId) {
  doubtSoundSelect.innerHTML = "";

  const builtins = [
    { id: "ding.mp3", label: "Default Ding" },
    { id: "alert.mp3", label: "Alert Tone" },
  ];

  for (const item of builtins) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.label;
    if (item.id === DEFAULTS.doubtSoundId) opt.selected = true;
    doubtSoundSelect.appendChild(opt);
  }

  for (const track of customAudios) {
    const opt = document.createElement("option");
    opt.value = track.id;
    opt.textContent = `Custom: ${track.name}`;
    doubtSoundSelect.appendChild(opt);
  }

  doubtSoundSelect.value = isValidSoundId(selectedId) ? selectedId : DEFAULTS.doubtSoundId;

  customAudioListEl.innerHTML = "";
  for (const track of customAudios) {
    const li = document.createElement("li");
    li.className = "custom-audio-item";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = track.name;
    titleSpan.title = track.name;

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-delete-audio";
    delBtn.textContent = "Remove";
    delBtn.addEventListener("click", () => removeCustomAudio(track.id));

    li.appendChild(titleSpan);
    li.appendChild(delBtn);
    customAudioListEl.appendChild(li);
  }
}

async function removeCustomAudio(id) {
  customAudios = customAudios.filter((t) => t.id !== id);
  await chrome.storage.local.set({ customAudios });

  let nextSelected = doubtSoundSelect.value;
  if (nextSelected === id) {
    nextSelected = DEFAULTS.doubtSoundId;
    await chrome.storage.sync.set({ doubtSoundId: nextSelected });
  }

  renderDoubtSoundOptions(nextSelected);
  flashStatus("Audio removed");
}

async function seedAudioDefaultsIfNeeded() {
  const stored = await chrome.storage.sync.get([
    "audioEnabled",
    "audioVolume",
    "doubtSoundId",
  ]);

  const patch = {};
  if (!Object.hasOwn(stored, "audioEnabled")) {
    patch.audioEnabled = DEFAULTS.audioEnabled;
  }
  if (!Object.hasOwn(stored, "audioVolume")) {
    patch.audioVolume = DEFAULTS.audioVolume;
  }
  if (!Object.hasOwn(stored, "doubtSoundId")) {
    patch.doubtSoundId = DEFAULTS.doubtSoundId;
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.sync.set(patch);
  }
}

async function load() {
  await seedAudioDefaultsIfNeeded();

  const [syncData, localData] = await Promise.all([
    chrome.storage.sync.get(DEFAULTS),
    chrome.storage.local.get({ customAudios: [] }),
  ]);

  customAudios = Array.isArray(localData.customAudios) ? localData.customAudios : [];

  startInput.value = syncData.slotStart || DEFAULTS.slotStart;
  endInput.value = syncData.slotEnd || DEFAULTS.slotEnd;
  autoAcceptEnabledInput.checked = Boolean(syncData.autoAcceptEnabled);
  autoAcceptRemainingInput.value =
    syncData.autoAcceptRemainingSec ?? DEFAULTS.autoAcceptRemainingSec;

  audioEnabledInput.checked = syncData.audioEnabled ?? DEFAULTS.audioEnabled;
  audioVolumeInput.value = clampVolume(syncData.audioVolume ?? DEFAULTS.audioVolume);

  renderDoubtSoundOptions(syncData.doubtSoundId || DEFAULTS.doubtSoundId);
  syncAutoAcceptOptionsVisibility();
  syncAudioUI();
  setStatus(startInput.value, endInput.value);
}

autoAcceptEnabledInput.addEventListener("change", syncAutoAcceptOptionsVisibility);

audioEnabledInput.addEventListener("change", () => {
  syncAudioUI();
  persistAudioSettings().catch(() => {});
});

audioVolumeInput.addEventListener("input", () => {
  syncAudioUI();
  persistAudioSettingsDebounced();
});

doubtSoundSelect.addEventListener("change", () => {
  persistAudioSettings().catch(() => {});
});

pickAudioBtn.addEventListener("click", () => {
  customAudioFileInput.click();
});

customAudioFileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (customAudios.length >= MAX_CUSTOM_AUDIOS) {
    flashStatus(`Max ${MAX_CUSTOM_AUDIOS} custom files`, "outside");
    customAudioFileInput.value = "";
    return;
  }

  if (file.size > MAX_CUSTOM_AUDIO_BYTES) {
    flashStatus("File must be under 4 MB", "outside");
    customAudioFileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    const newTrack = {
      id: `custom_${Date.now()}`,
      name: file.name,
      dataUrl: reader.result,
    };

    customAudios.push(newTrack);
    await Promise.all([
      chrome.storage.local.set({ customAudios }),
      chrome.storage.sync.set({ doubtSoundId: newTrack.id }),
    ]);

    customAudioFileInput.value = "";
    renderDoubtSoundOptions(newTrack.id);
    flashStatus(`Added "${file.name}"`);
  };
  reader.onerror = () => {
    flashStatus("Failed to read audio file", "outside");
    customAudioFileInput.value = "";
  };
  reader.readAsDataURL(file);
});

function resolveTestSrc(doubtSoundId) {
  if (BUILTIN_SOUNDS.includes(doubtSoundId)) {
    return chrome.runtime.getURL(doubtSoundId);
  }
  const custom = customAudios.find((t) => t.id === doubtSoundId);
  return custom?.dataUrl || chrome.runtime.getURL(DEFAULTS.doubtSoundId);
}

testAudioBtn.addEventListener("click", async () => {
  const audioEnabled = audioEnabledInput.checked;
  const audioVolume = clampVolume(audioVolumeInput.value);
  let doubtSoundId = doubtSoundSelect.value;
  if (!isValidSoundId(doubtSoundId)) {
    doubtSoundId = DEFAULTS.doubtSoundId;
    doubtSoundSelect.value = doubtSoundId;
  }

  await chrome.storage.sync.set({ audioEnabled, audioVolume, doubtSoundId });
  audioVolumeInput.value = audioVolume;

  if (!audioEnabled) {
    flashStatus("Alert sound is disabled", "outside");
    return;
  }

  if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
  }

  const src = resolveTestSrc(doubtSoundId);
  previewAudio = new Audio(src);
  previewAudio.volume = audioVolume;
  previewAudio.play().catch(() => {
    flashStatus("Unable to play test sound", "outside");
  });
});

saveBtn.addEventListener("click", async () => {
  const slotStart = startInput.value || DEFAULTS.slotStart;
  const slotEnd = endInput.value || DEFAULTS.slotEnd;
  const autoAcceptEnabled = autoAcceptEnabledInput.checked;
  let autoAcceptRemainingSec = Number(autoAcceptRemainingInput.value);
  const audioEnabled = audioEnabledInput.checked;
  const audioVolume = clampVolume(audioVolumeInput.value);
  let doubtSoundId = doubtSoundSelect.value;

  if (parseTimeToMinutes(slotEnd) < parseTimeToMinutes(slotStart)) {
    statusEl.textContent = "End must be after start (same day)";
    statusEl.className = "status outside";
    return;
  }

  if (Number.isNaN(autoAcceptRemainingSec)) {
    autoAcceptRemainingSec = DEFAULTS.autoAcceptRemainingSec;
  }

  if (
    autoAcceptEnabled &&
    (autoAcceptRemainingSec < MIN_REMAINING_SEC || autoAcceptRemainingSec > MAX_REMAINING_SEC)
  ) {
    statusEl.textContent = `Remaining seconds must be ${MIN_REMAINING_SEC}–${MAX_REMAINING_SEC}`;
    statusEl.className = "status outside";
    return;
  }

  autoAcceptRemainingSec = Math.min(
    MAX_REMAINING_SEC,
    Math.max(MIN_REMAINING_SEC, Math.round(autoAcceptRemainingSec)),
  );
  autoAcceptRemainingInput.value = autoAcceptRemainingSec;
  audioVolumeInput.value = audioVolume;

  if (!isValidSoundId(doubtSoundId)) {
    doubtSoundId = DEFAULTS.doubtSoundId;
    doubtSoundSelect.value = doubtSoundId;
  }

  await chrome.storage.sync.set({
    slotStart,
    slotEnd,
    autoAcceptEnabled,
    autoAcceptRemainingSec,
    audioEnabled,
    audioVolume,
    doubtSoundId,
  });

  setStatus(slotStart, slotEnd, "Saved");
  setTimeout(() => setStatus(slotStart, slotEnd), 1200);
});

load();

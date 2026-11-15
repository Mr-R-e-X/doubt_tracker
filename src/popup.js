const DEFAULTS = {
  slotStart: "21:00",
  slotEnd: "23:59",
  autoAcceptEnabled: false,
  autoAcceptRemainingSec: 20,
  audioEnabled: true,
  audioVolume: 1,
  doubtSoundId: "ding.mp3",
  toggleSoundId: "alert.mp3",
};

const BUILTIN_SOUNDS = [
  { id: "ding.mp3", label: "Default Ding" },
  { id: "alert.mp3", label: "Alert Tone" },
];
const BUILTIN_SOUND_IDS = BUILTIN_SOUNDS.map((s) => s.id);
const MIN_REMAINING_SEC = 20;
const MAX_REMAINING_SEC = 80;
const AUDIO_PERSIST_DEBOUNCE_MS = 180;

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
const toggleSoundSelect = document.getElementById("toggleSoundId");
const pickAudioBtn = document.getElementById("pickAudioBtn");
const customAudioListEl = document.getElementById("customAudioList");
const testAudioBtn = document.getElementById("testAudioBtn");
const testToggleBtn = document.getElementById("testToggleBtn");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

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

function isValidSoundId(id) {
  return BUILTIN_SOUND_IDS.includes(id) || customAudios.some((t) => t.id === id);
}

function fillSoundSelect(selectEl, selectedId, fallbackId) {
  selectEl.innerHTML = "";

  for (const item of BUILTIN_SOUNDS) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.label;
    selectEl.appendChild(opt);
  }

  for (const track of customAudios) {
    const opt = document.createElement("option");
    opt.value = track.id;
    opt.textContent = `Custom: ${track.name}`;
    selectEl.appendChild(opt);
  }

  selectEl.value = isValidSoundId(selectedId) ? selectedId : fallbackId;
}

function renderCustomList() {
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

function renderSoundOptions(doubtSelected, toggleSelected) {
  fillSoundSelect(doubtSoundSelect, doubtSelected, DEFAULTS.doubtSoundId);
  fillSoundSelect(toggleSoundSelect, toggleSelected, DEFAULTS.toggleSoundId);
  renderCustomList();
}

function readSoundIdsFromUi() {
  let doubtSoundId = doubtSoundSelect.value;
  let toggleSoundId = toggleSoundSelect.value;

  if (!isValidSoundId(doubtSoundId)) {
    doubtSoundId = DEFAULTS.doubtSoundId;
    doubtSoundSelect.value = doubtSoundId;
  }
  if (!isValidSoundId(toggleSoundId)) {
    toggleSoundId = DEFAULTS.toggleSoundId;
    toggleSoundSelect.value = toggleSoundId;
  }

  return { doubtSoundId, toggleSoundId };
}

async function persistAudioSettings() {
  const audioEnabled = audioEnabledInput.checked;
  const audioVolume = clampVolume(audioVolumeInput.value);
  const { doubtSoundId, toggleSoundId } = readSoundIdsFromUi();

  audioVolumeInput.value = audioVolume;
  await chrome.storage.sync.set({
    audioEnabled,
    audioVolume,
    doubtSoundId,
    toggleSoundId,
  });
}

function persistAudioSettingsDebounced() {
  if (audioPersistTimer) clearTimeout(audioPersistTimer);
  audioPersistTimer = setTimeout(() => {
    audioPersistTimer = null;
    persistAudioSettings().catch(() => {});
  }, AUDIO_PERSIST_DEBOUNCE_MS);
}

async function removeCustomAudio(id) {
  customAudios = customAudios.filter((t) => t.id !== id);
  await chrome.storage.local.set({ customAudios });

  const patch = {};
  let doubtSelected = doubtSoundSelect.value;
  let toggleSelected = toggleSoundSelect.value;

  if (doubtSelected === id) {
    doubtSelected = DEFAULTS.doubtSoundId;
    patch.doubtSoundId = doubtSelected;
  }
  if (toggleSelected === id) {
    toggleSelected = DEFAULTS.toggleSoundId;
    patch.toggleSoundId = toggleSelected;
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.sync.set(patch);
  }

  renderSoundOptions(doubtSelected, toggleSelected);
  flashStatus("Audio removed");
}

async function seedAudioDefaultsIfNeeded() {
  const stored = await chrome.storage.sync.get([
    "audioEnabled",
    "audioVolume",
    "doubtSoundId",
    "toggleSoundId",
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
  if (!Object.hasOwn(stored, "toggleSoundId")) {
    patch.toggleSoundId = DEFAULTS.toggleSoundId;
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.sync.set(patch);
  }
}

function resolveTestSrc(soundId, fallbackId) {
  if (BUILTIN_SOUND_IDS.includes(soundId)) {
    return chrome.runtime.getURL(soundId);
  }
  const custom = customAudios.find((t) => t.id === soundId);
  return custom?.dataUrl || chrome.runtime.getURL(fallbackId);
}

async function playTest(soundId, fallbackId) {
  const audioEnabled = audioEnabledInput.checked;
  const audioVolume = clampVolume(audioVolumeInput.value);
  const ids = readSoundIdsFromUi();

  await chrome.storage.sync.set({
    audioEnabled,
    audioVolume,
    doubtSoundId: ids.doubtSoundId,
    toggleSoundId: ids.toggleSoundId,
  });
  audioVolumeInput.value = audioVolume;

  if (!audioEnabled) {
    flashStatus("Alert sound is disabled", "outside");
    return;
  }

  if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
  }

  const src = resolveTestSrc(soundId, fallbackId);
  previewAudio = new Audio(src);
  previewAudio.volume = audioVolume;
  previewAudio.play().catch(() => {
    flashStatus("Unable to play test sound", "outside");
  });
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

  renderSoundOptions(
    syncData.doubtSoundId || DEFAULTS.doubtSoundId,
    syncData.toggleSoundId || DEFAULTS.toggleSoundId,
  );
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

toggleSoundSelect.addEventListener("change", () => {
  persistAudioSettings().catch(() => {});
});

pickAudioBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.customAudios) {
    customAudios = Array.isArray(changes.customAudios.newValue)
      ? changes.customAudios.newValue
      : [];
    renderSoundOptions(doubtSoundSelect.value, toggleSoundSelect.value);
  }
  if (area === "sync") {
    if (changes.doubtSoundId) {
      const next = changes.doubtSoundId.newValue || DEFAULTS.doubtSoundId;
      if (isValidSoundId(next)) doubtSoundSelect.value = next;
    }
    if (changes.toggleSoundId) {
      const next = changes.toggleSoundId.newValue || DEFAULTS.toggleSoundId;
      if (isValidSoundId(next)) toggleSoundSelect.value = next;
    }
  }
});

testAudioBtn.addEventListener("click", () => {
  const { doubtSoundId } = readSoundIdsFromUi();
  playTest(doubtSoundId, DEFAULTS.doubtSoundId);
});

testToggleBtn.addEventListener("click", () => {
  const { toggleSoundId } = readSoundIdsFromUi();
  playTest(toggleSoundId, DEFAULTS.toggleSoundId);
});

saveBtn.addEventListener("click", async () => {
  const slotStart = startInput.value || DEFAULTS.slotStart;
  const slotEnd = endInput.value || DEFAULTS.slotEnd;
  const autoAcceptEnabled = autoAcceptEnabledInput.checked;
  let autoAcceptRemainingSec = Number(autoAcceptRemainingInput.value);
  const audioEnabled = audioEnabledInput.checked;
  const audioVolume = clampVolume(audioVolumeInput.value);
  const { doubtSoundId, toggleSoundId } = readSoundIdsFromUi();

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

  await chrome.storage.sync.set({
    slotStart,
    slotEnd,
    autoAcceptEnabled,
    autoAcceptRemainingSec,
    audioEnabled,
    audioVolume,
    doubtSoundId,
    toggleSoundId,
  });

  setStatus(slotStart, slotEnd, "Saved");
  setTimeout(() => setStatus(slotStart, slotEnd), 1200);
});

load();

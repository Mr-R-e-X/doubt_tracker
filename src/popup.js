// ==========================================
// ORIGINAL CODE (Slot & Auto-Accept Logic)
// ==========================================
const DEFAULTS = {
  slotStart: "21:00",
  slotEnd: "23:59",
  autoAcceptEnabled: false,
  autoAcceptRemainingSec: 20,
};

const MIN_REMAINING_SEC = 20;
const MAX_REMAINING_SEC = 80;

const startInput = document.getElementById("slotStart");
const endInput = document.getElementById("slotEnd");
const autoAcceptEnabledInput = document.getElementById("autoAcceptEnabled");
const autoAcceptRemainingInput = document.getElementById(
  "autoAcceptRemainingSec"
);
const autoAcceptOptions = document.getElementById("autoAcceptOptions");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

function parseTimeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isWithinSlot(start, end, now = new Date()) {
  const current = now.getHours() * 60 + now.getMinutes();
  return (
    current >= parseTimeToMinutes(start) && current <= parseTimeToMinutes(end)
  );
}

function setStatus(start, end, extra) {
  const active = isWithinSlot(start, end);
  statusEl.textContent = extra || (active ? "Active now" : "Outside slot");
  statusEl.className = `status ${
    extra ? "saved" : active ? "active" : "outside"
  }`;
}

function syncAutoAcceptOptionsVisibility() {
  autoAcceptOptions.hidden = !autoAcceptEnabledInput.checked;
}

async function load() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  startInput.value = stored.slotStart || DEFAULTS.slotStart;
  endInput.value = stored.slotEnd || DEFAULTS.slotEnd;
  autoAcceptEnabledInput.checked = Boolean(stored.autoAcceptEnabled);
  autoAcceptRemainingInput.value =
    stored.autoAcceptRemainingSec ?? DEFAULTS.autoAcceptRemainingSec;
  syncAutoAcceptOptionsVisibility();
  setStatus(startInput.value, endInput.value);
}

autoAcceptEnabledInput.addEventListener(
  "change",
  syncAutoAcceptOptionsVisibility
);

saveBtn.addEventListener("click", async () => {
  const slotStart = startInput.value || DEFAULTS.slotStart;
  const slotEnd = endInput.value || DEFAULTS.slotEnd;
  const autoAcceptEnabled = autoAcceptEnabledInput.checked;
  let autoAcceptRemainingSec = Number(autoAcceptRemainingInput.value);

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
    (autoAcceptRemainingSec < MIN_REMAINING_SEC ||
      autoAcceptRemainingSec > MAX_REMAINING_SEC)
  ) {
    statusEl.textContent = `Remaining seconds must be ${MIN_REMAINING_SEC}–${MAX_REMAINING_SEC}`;
    statusEl.className = "status outside";
    return;
  }

  autoAcceptRemainingSec = Math.min(
    MAX_REMAINING_SEC,
    Math.max(MIN_REMAINING_SEC, Math.round(autoAcceptRemainingSec))
  );
  autoAcceptRemainingInput.value = autoAcceptRemainingSec;

  await chrome.storage.sync.set({
    slotStart,
    slotEnd,
    autoAcceptEnabled,
    autoAcceptRemainingSec,
  });

  setStatus(slotStart, slotEnd, "Saved");
  setTimeout(() => setStatus(slotStart, slotEnd), 1200);
});

load();

// ==========================================
// ADDED PART: Permanent Multi-Audio Manager
// ==========================================
const AUDIO_DEFAULTS = {
  audioEnabled: true,
  audioVolume: 1,
  selectedAudioId: "ding.mp3",
};
const MAX_CUSTOM_AUDIO_BYTES = 4 * 1024 * 1024; // 4 MB per file

const audioEnabledInput = document.getElementById("audioEnabled");
const audioOptions = document.getElementById("audioOptions");
const audioVolumeInput = document.getElementById("audioVolume");
const audioVolumeLabel = document.getElementById("audioVolumeLabel");
const audioPresetSelect = document.getElementById("audioPreset");
const customAudioFileInput = document.getElementById("customAudioFile");
const pickAudioBtn = document.getElementById("pickAudioBtn");
const customAudioListEl = document.getElementById("customAudioList");
const testAudioBtn = document.getElementById("testAudioBtn");

let customAudios = []; // Array of { id, name, dataUrl }
let previewAudio = null;

function syncAudioUI() {
  audioOptions.hidden = !audioEnabledInput.checked;
  audioVolumeLabel.textContent = `${Math.round(
    Number(audioVolumeInput.value) * 100
  )}%`;
}

function renderAudioDropdownAndList(selectedId) {
  // Rebuild dropdown options: 2 built-ins + all permanent custom files
  audioPresetSelect.innerHTML = `
    <option value="ding.mp3">Default Ding (ding.mp3)</option>
    <option value="alert.mp3">Alert Tone (alert.mp3)</option>
  `;

  customAudios.forEach((track) => {
    const opt = document.createElement("option");
    opt.value = track.id;
    opt.textContent = `Custom: ${track.name}`;
    audioPresetSelect.appendChild(opt);
  });

  // Restore active selection (fallback to ding.mp3 if deleted)
  const exists =
    selectedId === "ding.mp3" ||
    selectedId === "alert.mp3" ||
    customAudios.some((t) => t.id === selectedId);
  audioPresetSelect.value = exists ? selectedId : "ding.mp3";

  // Render manageable list with Delete buttons
  customAudioListEl.innerHTML = "";
  customAudios.forEach((track) => {
    const li = document.createElement("li");
    li.className = "custom-audio-item";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = track.name;
    titleSpan.title = track.name;

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-delete-audio";
    delBtn.textContent = "Remove";
    delBtn.addEventListener("click", async () => {
      customAudios = customAudios.filter((t) => t.id !== track.id);
      await chrome.storage.local.set({ customAudios });
      const nextSelected =
        audioPresetSelect.value === track.id
          ? "ding.mp3"
          : audioPresetSelect.value;
      await chrome.storage.sync.set({ selectedAudioId: nextSelected });
      renderAudioDropdownAndList(nextSelected);
      statusEl.textContent = "Audio removed";
      statusEl.className = "status saved";
      setTimeout(() => setStatus(startInput.value, endInput.value), 1200);
    });

    li.appendChild(titleSpan);
    li.appendChild(delBtn);
    customAudioListEl.appendChild(li);
  });
}

async function loadAudioSettings() {
  const [syncData, localData] = await Promise.all([
    chrome.storage.sync.get(AUDIO_DEFAULTS),
    chrome.storage.local.get({ customAudios: [] }),
  ]);

  customAudios = Array.isArray(localData.customAudios)
    ? localData.customAudios
    : [];

  audioEnabledInput.checked =
    syncData.audioEnabled ?? AUDIO_DEFAULTS.audioEnabled;
  audioVolumeInput.value = syncData.audioVolume ?? AUDIO_DEFAULTS.audioVolume;

  renderAudioDropdownAndList(
    syncData.selectedAudioId || AUDIO_DEFAULTS.selectedAudioId
  );
  syncAudioUI();
}

audioEnabledInput.addEventListener("change", syncAudioUI);
audioVolumeInput.addEventListener("input", syncAudioUI);

pickAudioBtn.addEventListener("click", () => {
  customAudioFileInput.click();
});

// Immediately save uploaded file permanently into chrome.storage.local
customAudioFileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.size > MAX_CUSTOM_AUDIO_BYTES) {
    statusEl.textContent = "File must be under 4 MB";
    statusEl.className = "status outside";
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
      chrome.storage.sync.set({ selectedAudioId: newTrack.id }),
    ]);

    customAudioFileInput.value = "";
    renderAudioDropdownAndList(newTrack.id);
    statusEl.textContent = `Added "${file.name}"`;
    statusEl.className = "status saved";
    setTimeout(() => setStatus(startInput.value, endInput.value), 1500);
  };
  reader.readAsDataURL(file);
});

testAudioBtn.addEventListener("click", () => {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
  }

  const selectedId = audioPresetSelect.value;
  const customTrack = customAudios.find((t) => t.id === selectedId);
  const src = customTrack
    ? customTrack.dataUrl
    : chrome.runtime.getURL(selectedId);

  previewAudio = new Audio(src);
  previewAudio.volume = Number(audioVolumeInput.value);
  previewAudio.play().catch(() => {
    statusEl.textContent = "Unable to play selected audio";
    statusEl.className = "status outside";
  });
});

// Persist active audio selection, volume, and mute switch on Save
saveBtn.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    audioEnabled: audioEnabledInput.checked,
    audioVolume: Number(audioVolumeInput.value),
    selectedAudioId: audioPresetSelect.value,
  });
});

loadAudioSettings();

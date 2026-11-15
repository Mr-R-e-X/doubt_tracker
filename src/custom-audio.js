const DEFAULT_DOUBT_SOUND = "ding.mp3";
const DEFAULT_TOGGLE_SOUND = "alert.mp3";
const MAX_CUSTOM_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_CUSTOM_AUDIOS = 3;

const fileInput = document.getElementById("customAudioFile");
const listEl = document.getElementById("customAudioList");
const statusEl = document.getElementById("status");

let customAudios = [];

function setStatus(message, kind = "saved") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`;
}

function renderList() {
  listEl.innerHTML = "";

  if (customAudios.length === 0) {
    const empty = document.createElement("li");
    empty.className = "hint";
    empty.textContent = "No custom files yet.";
    listEl.appendChild(empty);
    return;
  }

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
    listEl.appendChild(li);
  }
}

async function load() {
  const localData = await chrome.storage.local.get({ customAudios: [] });
  customAudios = Array.isArray(localData.customAudios) ? localData.customAudios : [];
  renderList();
}

async function removeCustomAudio(id) {
  customAudios = customAudios.filter((t) => t.id !== id);
  await chrome.storage.local.set({ customAudios });

  const stored = await chrome.storage.sync.get({
    doubtSoundId: DEFAULT_DOUBT_SOUND,
    toggleSoundId: DEFAULT_TOGGLE_SOUND,
  });

  const patch = {};
  if (stored.doubtSoundId === id) {
    patch.doubtSoundId = DEFAULT_DOUBT_SOUND;
  }
  if (stored.toggleSoundId === id) {
    patch.toggleSoundId = DEFAULT_TOGGLE_SOUND;
  }
  if (Object.keys(patch).length > 0) {
    await chrome.storage.sync.set(patch);
  }

  renderList();
  setStatus("Audio removed");
}

fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (customAudios.length >= MAX_CUSTOM_AUDIOS) {
    setStatus(`Max ${MAX_CUSTOM_AUDIOS} custom files`, "outside");
    fileInput.value = "";
    return;
  }

  if (file.size > MAX_CUSTOM_AUDIO_BYTES) {
    setStatus("File must be under 4 MB", "outside");
    fileInput.value = "";
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

    fileInput.value = "";
    renderList();
    setStatus(
      `Added "${file.name}". Reopen the popup to assign it to Doubt and/or Toggle sound.`,
    );
  };
  reader.onerror = () => {
    setStatus("Failed to read audio file", "outside");
    fileInput.value = "";
  };
  reader.readAsDataURL(file);
});

load();

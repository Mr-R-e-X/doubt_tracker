const DEFAULT_SLOT = { slotStart: "21:00", slotEnd: "23:59" };

const startInput = document.getElementById("slotStart");
const endInput = document.getElementById("slotEnd");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

function parseTimeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isWithinSlot(start, end, now = new Date()) {
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= parseTimeToMinutes(start) && current <= parseTimeToMinutes(end);
}

function setStatus(start, end, extra) {
  const active = isWithinSlot(start, end);
  statusEl.textContent = extra || (active ? "Active now" : "Outside slot");
  statusEl.className = `status ${extra ? "saved" : active ? "active" : "outside"}`;
}

async function load() {
  const stored = await chrome.storage.sync.get(DEFAULT_SLOT);
  startInput.value = stored.slotStart || DEFAULT_SLOT.slotStart;
  endInput.value = stored.slotEnd || DEFAULT_SLOT.slotEnd;
  setStatus(startInput.value, endInput.value);
}

saveBtn.addEventListener("click", async () => {
  const slotStart = startInput.value || DEFAULT_SLOT.slotStart;
  const slotEnd = endInput.value || DEFAULT_SLOT.slotEnd;

  if (parseTimeToMinutes(slotEnd) < parseTimeToMinutes(slotStart)) {
    statusEl.textContent = "End must be after start (same day)";
    statusEl.className = "status outside";
    return;
  }

  await chrome.storage.sync.set({ slotStart, slotEnd });
  setStatus(slotStart, slotEnd, "Saved");
  setTimeout(() => setStatus(slotStart, slotEnd), 1200);
});

load();

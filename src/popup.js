const DEFAULTS = {
  slotStart: "21:00",
  slotEnd: "23:59",
  autoAcceptEnabled: false,
  autoAcceptRemainingSec: 20
};

const MIN_REMAINING_SEC = 20;
const MAX_REMAINING_SEC = 80;

const startInput = document.getElementById("slotStart");
const endInput = document.getElementById("slotEnd");
const autoAcceptEnabledInput = document.getElementById("autoAcceptEnabled");
const autoAcceptRemainingInput = document.getElementById("autoAcceptRemainingSec");
const autoAcceptOptions = document.getElementById("autoAcceptOptions");
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

autoAcceptEnabledInput.addEventListener("change", syncAutoAcceptOptionsVisibility);

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
    autoAcceptRemainingSec
  });

  setStatus(slotStart, slotEnd, "Saved");
  setTimeout(() => setStatus(slotStart, slotEnd), 1200);
});

load();

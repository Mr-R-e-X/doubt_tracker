const SOUND_FILES = {
  toggle: "alert.mp3",
  doubt: "ding.mp3",
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Ignore content-script broadcasts; only play when relayed by the service worker
  if (msg.type !== "PLAY_ALERT" || sender.tab) return;

  const file = SOUND_FILES[msg.sound];
  if (!file) return;

  const audio = new Audio(chrome.runtime.getURL(file));
  audio.play();
});

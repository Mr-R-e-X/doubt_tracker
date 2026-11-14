async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play alert sound"
    });
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== "PLAY_ALERT" || !sender.tab) return;

  ensureOffscreen().then(() => {
    chrome.runtime.sendMessage({
      type: "PLAY_ALERT",
      sound: msg.sound
    });
  });
});

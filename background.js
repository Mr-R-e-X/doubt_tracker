async function playSound() {
  const exists = await chrome.offscreen.hasDocument();
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play alert sound"
    });
  }

  chrome.runtime.sendMessage({ type: "PLAY_SOUND" });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SWITCH_CHANGED") {
    playSound();
  }
  if(msg.type === "TEXT_FOUND"){
    playSound()
  }
});



chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "PLAY_SOUND") {
    const audio = new Audio(chrome.runtime.getURL("alert.mp3"));
    audio.play();
  }
  if(msg.type === "TEXT_FOUND"){
    const audio = new Audio(chrome.runtime.getURL("ding.mp3"));
    audio.play();
  }
});

const buttonSelector = "#mat-mdc-slide-toggle-1-button";

function watchToggleButton() {
  const btn = document.querySelector(buttonSelector);
  if (!btn) return;

  let lastState = btn.classList.contains("mdc-switch--checked");
  let isRestoring = false;

  const observer = new MutationObserver(() => {
    const currentState = btn.classList.contains("mdc-switch--checked");

    if (lastState && !currentState && !isRestoring) {
      isRestoring = true;

      chrome.runtime.sendMessage({
        type: "SWITCH_CHANGED",
        checked: false
      });

      setTimeout(() => {
        btn.click();        
        isRestoring = false;
      }, 1000);
    }

    lastState = currentState;
  });

  observer.observe(btn, {
    attributes: true,
    attributeFilter: ["class"]
  });
}

const interval = setInterval(() => {
  if (document.querySelector(buttonSelector)) {
    clearInterval(interval);
    watchToggleButton();
  }
}, 1000);


function pageContainsAcceptReject() {
  const el = document.querySelector("mentor-assigned-doubt");
  if (!el) return false;

  const text = el.innerText.trim();
  return text.includes("Accept") || text.includes("Reject");
}

const observer = new MutationObserver(() => {
  if (pageContainsAcceptReject()) {
    chrome.runtime.sendMessage({
      type: "TEXT_FOUND",
      keywords: ["Accept"]
    });

    console.log("AN INCOMING DOUBT...");
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});


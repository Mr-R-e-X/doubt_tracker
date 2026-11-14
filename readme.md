# Coding Ninjas Mentor Alert – Chrome Extension

## Purpose

This Chrome extension improves reliability on the **Coding Ninjas Mentor Doubt page** by keeping you online during your slot and alerting you when a new doubt arrives.

---

## Problems Solved

### 1. Take Doubt Toggle Turns OFF Automatically
- Due to network issues or UI re-renders, the **Take Doubt** switch sometimes turns OFF.
- This silently stops new doubt assignments.

### 2. No Notification for New Doubts
- New doubts can be assigned without any sound or alert.
- If you’re not looking at the screen, the doubt can be missed.

### 3. Watching Outside Your Slot
- Mentors only need alerts during their assigned window (e.g. 9:00 PM–11:59 PM).

---

## Solution

### Auto-Restore Take Doubt
- Waits until the workplace UI (Take Doubt control) is ready, then watches the toggle
- If it turns OFF unexpectedly during your slot, restores it ON after **1 second** and plays `alert.mp3`

### Audio Alert for New Doubts
- Monitors the assigned doubt section during your slot
- Plays `ding.mp3` once when **Accept / Reject** appears (edge-detected, not on every DOM tweak)

### Slot Schedule (popup)
- Click the extension icon to set **Start** and **End** (local time, same-day window)
- Defaults: `21:00`–`23:59`
- Outside the slot: no restore, no sounds
- If the tab stays open, watching starts/stops when the clock enters or leaves the slot
- Saving in the popup updates the open workplace tab without a reload

---

## How It Works

1. Injects at `document_idle`, waits for full page load, then waits for the Take Doubt UI
2. Loads slot times from `chrome.storage.sync`
3. While in slot: MutationObservers for toggle restore + new-doubt alerts
4. Service worker ensures an offscreen document and plays the correct sound

Safe for Angular / SPA pages (re-waits if the toggle is remounted).

---

## Target

- **Platform:** Coding Ninjas Mentor Portal  
- **Page:** Doubt Workplace (`https://mentor.codingninjas.com/doubts/workplace`)

---

## Outcome

- No missed doubts during your slot  
- No accidental offline state while watching  
- Quiet outside your configured window  

---
**Author:** Souvik Hazra  
**GitHub:** https://github.com/Mr-R-e-X  
*Built for mentors who want reliability without distraction.*

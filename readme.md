# Coding Ninjas Mentor Alert – Chrome Extension

## Purpose

This Chrome extension improves reliability and responsiveness on the **Coding Ninjas Mentor Doubt page** by solving two common issues mentors face during sessions.

---

## Problems Solved

### 1. Take Doubt Toggle Turns OFF Automatically
- Due to network issues or UI re-renders, the **Take Doubt** switch sometimes turns OFF.
- This silently stops new doubt assignments.

### 2. No Notification for New Doubts
- New doubts can be assigned without any sound or alert.
- If you’re not looking at the screen, the doubt can be missed.

---

## Solution

### ✅ Auto-Restore Take Doubt
- Watches the toggle button in real time
- If it turns OFF unexpectedly, the extension turns it back ON after **1 second**

### 🔔 Audio Alert for New Doubts
- Monitors the assigned doubt section
- Plays a sound when **Accept / Reject** actions appear
- Ensures you never miss a new doubt

---

## How It Works

- Uses **DOM observers** and **periodic checks**
- Safe for Angular / SPA pages
- Lightweight and fully automatic

---

## Target

- **Platform:** Coding Ninjas Mentor Portal  
- **Page:** Doubt Workplace

---

## Outcome

✔ No missed doubts  
✔ No accidental offline state  
✔ Improved mentor productivity  

---
**Author:** Souvik Hazra  
**GitHub:** https://github.com/Mr-R-e-X  
*Built for mentors who want reliability without distraction.*

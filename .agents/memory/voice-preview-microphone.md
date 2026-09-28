---
name: Voice preview microphone
description: Distinguishing voice app defects from a browser runner without a microphone device
---

Browser automation can expose `getUserMedia` in a secure context with microphone permission allowed yet fail with `NotFoundError` because the runner has no microphone device. Do not diagnose this as a Replit preview permissions problem without checking those capabilities.

**Why:** A voice-mode browser check could play generated speech and display a briefing, but could not record audio because the test runner had no input device. The model-backed voice-turn endpoint separately accepted generated speech and answered using real snapshot counts.

**How to apply:** When verifying voice changes, inspect secure context, media-device availability, and permission state. Confirm audio output and the no-device UI in the browser; verify voice-input processing with a generated recording or a real device rather than treating the runner's absent mic as a code regression.
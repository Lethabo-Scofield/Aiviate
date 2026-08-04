# Test Plan

Status: planned only.

Required future tests:

- Device registration rejects unknown credentials.
- Signed event verification rejects bad signatures.
- Replay protection rejects duplicate events.
- Offline buffered events preserve original timestamps.
- A single fatigue observation cannot confirm an accident.
- A simulated confirmed incident creates an audited APP call request only in simulation mode.
- Real emergency/public numbers are blocked in development and automated tests.

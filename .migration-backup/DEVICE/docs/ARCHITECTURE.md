# Device Architecture

Status: planned only.

The future DEVICE is expected to collect driver-facing camera observations, GPS context, device health and future impact or motion-sensor signals. Where practical, inference should happen locally on the device so raw video is not continuously uploaded.

Planned event flow:

```text
Device sensors
-> local observation classification
-> signed safety event
-> APP /api/device/v1/safety-events
-> safety policy review
-> suspected incident
-> human or policy confirmation
-> approved operational action
```

The DEVICE must not assign drivers, change routes, access APP databases, contact public emergency services, or independently confirm accidents.

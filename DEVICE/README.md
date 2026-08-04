# Aiviate Device

Status: planned only.

This area documents the future physical driver-monitoring device. It does not contain runnable device firmware, mobile sensing software, ML inference code or emergency-call automation.

The planned device may produce safety observations that flow into the APP operational API as signed events. Aiviate must treat those events as inputs to a safety workflow, not as proof of an accident.

```text
Observation
-> safety signal
-> suspected incident
-> confirmed incident
```

A single camera observation must never confirm an accident or trigger an unrestricted emergency call.

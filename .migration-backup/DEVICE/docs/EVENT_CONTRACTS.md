# Event Contracts

Status: planned only.

Planned endpoint:

```text
POST /api/device/v1/safety-events
```

Required event fields:

- `event_id`
- `schema_version`
- `device_id`
- `tenant_id`
- `driver_id`
- `occurred_at`
- `firmware_version`
- `model_version`
- `event_type`
- `confidence`
- `gps`
- `observations`
- `signature`
- `nonce`

Replay protection must reject repeated `event_id` and `nonce` values within the configured retention window.

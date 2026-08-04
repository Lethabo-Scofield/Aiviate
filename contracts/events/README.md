# Aiviate Shared Event Contracts

Status: v1 draft.

Every event uses the common envelope in `event-envelope.schema.json`:

- `event_id`
- `event_type`
- `schema_version`
- `occurred_at`
- `tenant_id`
- `correlation_id`
- `source`
- entity identifiers
- `payload`

## Producers And Consumers

| Event type | Producer | Consumers |
| --- | --- | --- |
| `merchant.order_created` | WEB merchant simulator or external merchant | APP |
| `order.imported` | APP | APP audit, decision engine adapter |
| `order.validation_result` | Decision engine | APP |
| `dispatch.plan_created` | Decision engine | APP |
| `job.assigned` | APP | Driver App, Call Agent context |
| `driver.invited` | APP | Admin UI, email/simulation inbox |
| `driver.location_updated` | Driver App | APP |
| `stop.status_changed` | Driver App / APP | APP, Call Agent context |
| `operational.delay_detected` | APP | Decision engine, admin UI |
| `reoptimization.requested` | APP | Decision engine |
| `route.changed` | APP | Driver App, admin UI |
| `safety.signal_received` | Future DEVICE / APP | APP safety policy |
| `safety.incident_confirmed` | APP safety policy | Call Agent |
| `call.requested` | APP | Call Agent |
| `call.completed` | Call Agent | APP |

Schemas are intentionally small at this stage. Domain-specific payload schemas should be split out as each workflow is implemented.

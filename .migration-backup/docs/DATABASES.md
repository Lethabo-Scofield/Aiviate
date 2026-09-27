# Aiviate Databases

## Operational PostgreSQL

The APP operational database is owned by `Website/backend`.

It is the source of truth for:

- companies and tenants
- users, roles and service authentication
- drivers and vehicles
- merchant integrations
- orders and order ingestion
- jobs, stops, routes and dispatch plans
- driver assignments and mobile app state
- safety signals and incidents
- call-agent requests and outcomes
- audit, idempotency and correlation records

Current MVP ORM tables live in `Website/backend/models.py`.

The expanded production schema lives in:

```text
Website/backend/migrations/20260810_expand_operational_schema.sql
```

That migration adds more than 80 domain tables. The tables are grouped around
real product ownership boundaries, not database decoration.

## Decision Engine Database

The deterministic planning engine owns planning internals:

- planning inputs
- matrices
- routes
- plans
- confidence results
- re-optimisation history
- engine explanations

It lives under:

```text
Website/aiviate-engine
```

The APP backend should call the engine API. Browsers, the Driver App and the
Call Agent should not call the engine directly.

## Call Agent Tables

The Call Agent should not own delivery state, but it does need durable tables
for call operations:

- `call_requests`
- `call_records`
- `call_contexts`
- `call_tool_invocations`
- `call_webhooks`
- `call_webhook_events`
- `call_outcomes`
- `call_transcripts`
- `call_handoffs`
- `call_availability_confirmations`
- `call_reschedule_requests`
- `call_redaction_events`

These tables are in the APP operational database because the APP remains the
operational authority. The Call Agent service must write through controlled APP
APIs or service-scoped backend code, not direct browser access.

## Migration Command

Set the database URL as an environment variable, then run:

```bash
psql "$DATABASE_URL" -f Website/backend/migrations/20260810_expand_operational_schema.sql
```

Do not commit the real database URL.

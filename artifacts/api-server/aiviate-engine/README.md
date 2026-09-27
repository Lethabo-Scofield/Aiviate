# Aiviate Decision Engine

Deterministic dispatch planning for the Aiviate logistics platform: order
validation, geocoding, road travel matrices, geographic clustering, CVRPTW
optimisation (Google OR-Tools), driver/vehicle assignment, independent plan
validation, confidence scoring, safety-aware re-optimisation and a full
decision audit trail. No LLM is involved in any routing decision.

## Architecture

A modular monolith. Each module has one responsibility, typed inputs/outputs
(Pydantic), its own tests, structured logging and error handling:

```
src/aiviate/
├── domain/            What is true: typed entities, enums, geo primitives
├── rules/             What is allowed: per-organisation business rules
├── validation/        Order validation (structured field/code/message errors)
├── geocoding/         Provider interface, local adapter, cache, review queue
├── matrix/            Provider interface, OSRM adapter, haversine fallback, cache
├── clustering/        Capacity-aware seeded clustering (initial solver hints)
├── solver/            What is optimal: OR-Tools CVRPTW with weighted objective
├── assignment/        Driver/vehicle eligibility + human-readable explanations
├── planvalidation/    Independent re-validation of every solver result
├── confidence/        Deterministic confidence score + decision levels
├── reoptimization/    Event-driven re-planning with locks and diff reports
├── safety/            Safety events, multi-signal accident confirmation
├── audit/             Decision records: snapshot, rules, result, explanation
├── jobs/              DB-backed job queue (eager or thread executor)
├── api/               FastAPI: auth, tenancy, RBAC, idempotency, rate limits
├── simulation/        Deterministic pilot simulation (seed 42)
├── engine.py          Pipeline orchestrator (composes the modules)
├── factories.py       Settings → concrete providers
├── notifications.py   Notifier + voice-escalation ports (logging adapters)
├── observability.py   JSON logging, correlation IDs, in-process metrics
└── config.py          Deployment settings (AIVIATE_* env vars)
```

Separation of concerns: `domain` holds facts, `rules` holds what is allowed,
`solver` optimises, `planvalidation` re-checks the result from first
principles, and the pipeline in `engine.py` only composes. An invalid plan is
never published, even when the solver reports success.

## Planning workflow

```
orders → validate → geocode (confidence-gated) → travel matrix → cluster
→ CVRPTW solve → independent plan validation → confidence score
→ auto-publish / require approval / manual intervention → audit records
→ operational & safety events → re-optimise affected routes only
```

Confidence decision levels (per-organisation thresholds): ≥ 0.90 auto-publish
(when auto dispatch is enabled), 0.70–0.89 requires administrator approval,
below 0.70 requests manual intervention. A plan built entirely on fallback
(straight-line) travel data cannot auto-publish.

## Local setup

Requires Python ≥ 3.12.

```bash
cd apps/aiviate-engine
python -m venv .venv
.venv/Scripts/activate            # Windows; source .venv/bin/activate elsewhere
pip install -e ".[dev]"

cp .env.example .env              # adjust if needed
alembic upgrade head              # create the schema
python -m aiviate.bootstrap --name "Pilot Logistics"   # org + fleet + API keys
uvicorn aiviate.api.app:create_app --factory --reload
```

Interactive API docs: http://localhost:8000/docs (OpenAPI via FastAPI).
Health: `/healthz`. Metrics snapshot: `/metrics`.

Run the deterministic pilot simulation (30 orders, 3 drivers, breakdown +
fatigue events, audit explanations):

```bash
python -m aiviate.simulation.pilot
```

### Tests, types, lint

```bash
pytest                    # unit, solver, integration, invariant suites
mypy src
ruff check src tests
```

### Docker

```bash
docker compose up --build   # API + PostgreSQL/PostGIS (+ optional OSRM)
```

## API

All endpoints require `X-API-Key` (created by `aiviate.bootstrap`). Roles:
`admin` (approve/reject), `dispatcher` (orders, plans), `driver` (own route
only), `device` (safety events). Tenant isolation is structural — the
organisation always comes from the verified key, never the request body.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/orders` | validate + geocode one order |
| POST | `/api/v1/orders/import` | bulk import (job); `Idempotency-Key`; optional `X-Webhook-Signature` (HMAC-SHA256 of raw body with the org webhook secret) |
| GET | `/api/v1/orders` | list, filter by `status` |
| POST | `/api/v1/dispatch/plans` | create plan (job); `Idempotency-Key` |
| GET | `/api/v1/dispatch/plans/{plan_id}` | plan + routes + stops |
| POST | `/api/v1/dispatch/plans/{plan_id}/approve` | admin only |
| POST | `/api/v1/dispatch/plans/{plan_id}/reject` | admin only |
| POST | `/api/v1/dispatch/plans/{plan_id}/reoptimise` | job; `Idempotency-Key` |
| GET | `/api/v1/drivers/{driver_id}/active-route` | driver sees own route only |
| PATCH | `/api/v1/routes/{route_id}/stops/{stop_id}` | stop transitions; `Idempotency-Key`; completed stops immutable |
| POST | `/api/v1/events/safety` | device/driver/admin; deduplicated; may enqueue re-optimisation |
| GET | `/api/v1/events` | list operational events |
| GET | `/api/v1/plans/{plan_id}/explanation` | full audit trail |
| GET | `/api/v1/jobs/{job_id}` | job status/progress/result/error |

Long-running work (imports, plan creation, re-optimisation) returns `202` with
a `job_id`; jobs expose `queued/running/completed/failed/cancelled` with
progress, error details and retry counts.

## Business rules (per organisation)

Stored as a JSON override document on `Organisation.operating_rules`, merged
over defaults (`aiviate/rules/engine.py`): objective weights (travel time/
distance, vehicle cost, late/unassigned/overtime/imbalance/reassignment
penalties, priority multipliers), geocoding minimum confidence (default 0.85)
and service area, approval thresholds and auto-dispatch, safety policy
(accident confirmation signals/window, fatigue break policy, escalation
contacts), depots, shift overtime and lateness grace. Nothing regional is
hard-coded; the pilot geography is pure configuration.

## Providers

**Geocoding** (`AIVIATE_GEOCODING_PROVIDER`): `local` is a deterministic,
credential-free adapter — fixture addresses resolve exactly; unknown addresses
get low confidence and are routed to administrator review, never into
automatic dispatch. To integrate a real provider, implement
`aiviate.geocoding.provider.GeocodingProvider` (one method:
`geocode(normalised_address) -> GeocodeResult`) and register it in
`aiviate/factories.py`. Results are cached per provider+address.

**Travel matrix** (`AIVIATE_MATRIX_PROVIDER`): `osrm` calls an OSRM `/table`
service (chunking, retry with backoff on 429/5xx, partial-failure tolerant) —
point `AIVIATE_OSRM_BASE_URL` at a self-hosted instance with a South Africa
extract. `haversine` is a straight-line fallback with a road-circuity factor;
every fallback entry is flagged and the confidence scorer downgrades plans
built on it. Matrix entries are cached by provider + coordinate pair.

**Notifications / voice escalation**: `aiviate/notifications.py` defines
`Notifier` and `VoiceEscalationPort` protocols with logging adapters. A real
voice API (e.g. Retell AI) plugs in as a `VoiceEscalationPort` — it places
calls only and never decides whether an accident occurred; that decision
stays with the multi-signal confirmation policy in the safety controller.

## Database migrations

Alembic, configured in `alembic.ini` + `alembic/env.py` (reads
`AIVIATE_DATABASE_URL`). Initial schema: `alembic/versions/483b2c765511_*.py`.

```bash
alembic upgrade head
alembic revision --autogenerate -m "describe change"
```

SQLite is the local default; PostgreSQL is the production target (install the
`postgres` extra). All types are portable across both.

## Known limitations

- **Reassignment penalty is indirect**: re-optimisation seeds the solver with
  the previous plan (local search preserves assignments) and reports
  reassignment counts, but there is no per-order soft cost for switching
  vehicles inside the OR-Tools objective yet.
- **Job executor is in-process** (eager or thread). The `JobQueue.enqueue`
  contract is Celery-ready, but the Celery/Redis adapter is not implemented.
- **Driver breaks are a safety gate, not a solver constraint**: a required
  break blocks new assignments and triggers re-optimisation; break windows are
  not yet inserted into route schedules.
- **Single depot per organisation** is used for route start/end (the first
  configured depot); multiple depots per plan are not yet selected per route.
- **OR-Tools reproducibility**: data generation is fully seeded; time-limited
  guided local search may return different (equally valid) optima across
  machine speeds. Invariants, not exact sequences, are asserted.
- **PostGIS is optional and unused by default** — geospatial maths is done in
  the geo module and by matrix providers; a geography column migration is a
  straightforward follow-up.
- **Rate limiting and idempotency stores** are per-process/DB-backed
  respectively; multi-replica deployments should move rate limiting to a
  shared store (Redis).
- **No CRUD endpoints for drivers/vehicles/organisations** — fleet management
  is seeded via `aiviate.bootstrap` (the Admin product owns fleet CRUD).

## Recommended next steps

1. OSRM instance for the pilot region and switch `AIVIATE_MATRIX_PROVIDER=osrm`.
2. Real geocoding adapter (Google/Nominatim) behind the existing interface.
3. Celery/Redis job adapter; move rate limiting to Redis.
4. Soft same-vehicle preference in the solver objective for re-optimisation.
5. Break insertion as solver time-dimension intervals.
6. Fleet CRUD + address-review resolution endpoints for Aiviate Admin.
7. Push/SMS notifier adapters and a Retell AI voice-escalation adapter.
8. Prometheus exporter for the metrics registry; OpenTelemetry tracing.

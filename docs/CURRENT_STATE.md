# Aiviate Current State

Last audited: 2026-08-05

## Repository Identity

The local workspace is checked out from:

```text
origin https://github.com/Lethabo-Scofield/Aviate_Admin.git
branch main
```

The user-facing target is the unified Aiviate monorepo. The current tracked repository already has the consolidated application areas listed below. Old untracked root folders from the previous layout are present locally and are not part of the tracked monorepo.

## Actual Tracked Top-Level Tree

```text
.
├── App/
├── Call Agent/
└── Website/
```

Local untracked leftovers currently visible at the root:

```text
.env
api/
backend/
dist/
node_modules/
aviate-api.err.log
aviate-api.log
aviate-api.out.log
aviate-web.log
```

These should not be treated as authoritative without an explicit cleanup decision.

## Component Responsibilities

### App

Tracked path: `App/`

Current role: Expo/React Native driver-facing mobile application.

Entry points:

- `App/App.js`
- `App/index.js`

Package manager:

- npm with `App/package.json` and `App/package-lock.json`

Current scripts:

- `npm start`
- `npm run android`
- `npm run ios`
- `npm run web`
- `npm test`

Notable current implementation:

- Driver and jobs contexts exist under `App/src/contexts/`.
- API service exists at `App/src/services/api.js`.
- Driver UI screens exist for jobs, active job, notifications, profile and earnings.
- Seed/mock data remains under `App/src/data/`.

Current blockers:

- Jest did not run from the default script on this machine until the script was pointed directly at `node_modules/jest/bin/jest.js`.
- The local `jest-expo` package currently fails Jest preset validation.
- The app now has a backend mode through `EXPO_PUBLIC_AIVIATE_API_URL` and a driver login screen. Without the API URL it still uses seed data for local preview and tests.

### Website

Tracked path: `Website/`

Current role: Web admin/dashboard, Flask operational API, and the deterministic decision engine.

Frontend entry point:

- `Website/src/main.jsx`
- `Website/src/App.jsx`

Frontend package manager:

- npm with `Website/package.json` and `Website/package-lock.json`

Backend entry points:

- `Website/backend/app.py`
- `Website/backend/wsgi.py`
- `Website/api/index.py` for serverless deployment

Backend package managers:

- pip with `Website/backend/requirements.txt`
- Python project metadata at `Website/pyproject.toml`

Decision engine entry points:

- `Website/aiviate-engine/src/aiviate/api/app.py`
- `Website/aiviate-engine/replit_app.py`

Decision engine package manager:

- Python project metadata at `Website/aiviate-engine/pyproject.toml`
- Alembic migrations under `Website/aiviate-engine/alembic/`

Operational database:

- Flask backend uses PostgreSQL via `NEON_DATABASE_URL` or `DATABASE_URL`.
- SQLAlchemy models are in `Website/backend/models.py`.
- Cold-start compatibility migrations currently run in `Website/backend/app.py`.
- Expanded production schema migration is in `Website/backend/migrations/20260810_expand_operational_schema.sql`.

Decision-engine database:

- Engine database schema and migrations are under `Website/aiviate-engine/alembic/`.
- Engine tables are defined in `Website/aiviate-engine/src/aiviate/db/tables.py`.

Existing APP API routes:

- `/api/health`
- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/me`
- `/api/jobs`
- `/api/drivers`
- `/api/stops`
- `/api/upload`
- `/api/stats`
- `/api/safety/*`
- `/api/devices/*`
- `/api/alerts/*`
- `/api/live-ops`
- `/api/intelligence/*`
- `/api/agents/*`
- `/api/autopilot/*`
- `/api/engine/*`
- `/api/store/orders`
- `/api/store/orders/import`
- `/api/store/integration`
- `/api/integrations/health`
- `/api/integrations/orders`
- `/api/integrations/orders/bulk`
- `/api/integrations/orders/{external_order_id}`

Existing decision-engine routes:

- `/healthz`
- `/metrics`
- `/api/v1/config/depot`
- `/api/v1/orders`
- `/api/v1/orders/import`
- `/api/v1/dispatch/plans`
- `/api/v1/dispatch/plans/{plan_id}`
- `/api/v1/dispatch/plans/{plan_id}/approve`
- `/api/v1/dispatch/plans/{plan_id}/reject`
- `/api/v1/dispatch/plans/{plan_id}/reoptimise`
- `/api/v1/dispatch/plans/jobs/{job_id}`
- `/api/v1/plans/{plan_id}/explanation`
- `/api/v1/events/safety`
- `/api/v1/drivers/{driver_id}/active-route`
- `/api/v1/routes/{route_id}/stops/{stop_id}`

Existing integrations:

- The Flask backend has a server-side adapter in `Website/backend/engine_client.py` that calls the OR-Tools decision engine.
- The browser calls the Flask APP API through `Website/src/services/api.js`.
- The admin web app can import external store orders through `/api/store/orders/import`, but this is an authenticated admin pull flow rather than a merchant-owned push API.
- A canonical merchant integration API has now been started under `/api/integrations/*` with merchant API-key authentication, tenant isolation, duplicate prevention, correlation IDs, structured validation errors, and audit records.
- A production database expansion migration now defines 117 additional APP-owned operational domain tables.

Missing integrations:

- WEB store simulator is not yet a separate external merchant app. The current `Website/` area combines admin UI, APP backend and web surfaces.
- WEB does not yet persist its own merchant orders independently and then submit them to APP.
- The Call Agent is not yet connected to the APP operational API.
- Driver invitations still need secure one-time activation links.
- Route-change events are not yet fully event-driven across APP, engine and driver app.
- Shared JSON Schema/OpenAPI contracts still need to be added at root.

### Call Agent

Tracked path: `Call Agent/`

Current role: Retell call-agent backend service. A separate static frontend exists but is deprecated and should not be deployed.

Backend entry point:

- `Call Agent/Backend/server.js`

Deprecated frontend prototype entry points:

- `Call Agent/Frontend/index.html`
- `Call Agent/Frontend/js/main.js`
- `Call Agent/Frontend/js/ai.js`

Package managers:

- npm with `Call Agent/Backend/package.json`
- npm with `Call Agent/Frontend/package.json` for the deprecated local prototype only

Existing routes:

- `POST /api/create-web-call`
- `/api/orders/*` routes backed by local JSON
- `POST /internal/v1/calls`
- `GET /internal/v1/calls/{call_id}`
- `POST /webhooks/retell`
- `POST /tools/verify-customer`
- `POST /tools/order-status`
- `POST /tools/request-reschedule`
- `POST /tools/confirm-availability`
- `POST /tools/human-handoff`
- `GET /health`
- `GET /tools/health`

Current blockers:

- `Call Agent/Backend/controllers/orderController.js` reads and writes `Call Agent/Backend/data/orders.json`.
- The old `/api/orders/*` route remains JSON-backed and must not be used as the production source.
- The new `/tools/*` routes call the APP customer-support API with `AIVIATE_SERVICE_TOKEN`.
- Retell webhook signature verification and webhook deduplication have a first implementation, but webhook persistence still needs durable storage.
- Simulation mode is explicit through `CALL_AGENT_SIMULATION_MODE=true` or missing `AIVIATE_SERVICE_TOKEN`.
- `Call Agent/Frontend` is not a production surface; browser voice support belongs in WEB and should call the Call Agent backend.

## Environment Variables Found

Operational APP backend:

- `NEON_DATABASE_URL`
- `DATABASE_URL`
- `DB_CONNECT_TIMEOUT`
- `JWT_SECRET`
- `ALLOWED_ORIGINS`
- `ORDERS_DATABASE_URL`
- `ORDERS_COMPANY_ID`
- `ENGINE_URL`
- `SKIP_DB_INIT`
- `VERCEL`
- `MERCHANT_API_RATE_LIMIT_PER_MINUTE`

Website frontend:

- `VITE_API_URL`

Decision engine:

- Engine settings are defined in `Website/aiviate-engine/src/aiviate/config.py`.
- Notable defaults include a local OSRM URL and API-key auth.

Call Agent:

- `RETELL_API_KEY`
- `RETELL_AGENT_ID`

Required but not fully wired yet:

- `RETELL_FROM_NUMBER`
- `RETELL_WEBHOOK_SECRET`
- `AIVIATE_API_URL`
- `AIVIATE_SERVICE_TOKEN`
- `CALL_AGENT_SIMULATION_MODE`

## Deployment Files

- `Website/vercel.json`
- `Website/.vercelignore`
- `Website/backend/Procfile`
- `Website/backend/render.yaml`
- `Website/aiviate-engine/Dockerfile`
- `Website/aiviate-engine/docker-compose.yml`
- `App/eas.json`
- `App/.replit`
- `Website/.replit`

Root orchestration is not yet present.

## Duplicate Or Obsolete Code

- Store order import exists as a legacy admin pull flow under `/api/store/*`.
- The new merchant push API exists under `/api/integrations/*` and should become the external integration contract.
- Call Agent JSON order data is obsolete for production paths.
- Driver app seed data is useful for local UI development and tests. Production mobile builds must configure the APP API URL and use the driver login flow.
- Device-like backend tables and screens exist, but the physical DEVICE product is not implemented and must be documented as planned only.

## Hard-Coded Localhost And Mock Data

- `Call Agent/Frontend/js/api.js` uses `http://localhost:3000/api`.
- `Call Agent/Frontend/js/ai.js` uses `http://localhost:3000/api/create-web-call`.
- `Website/backend/engine_client.py` defaults to `http://localhost:8080`.
- `Website/vite.config.js` proxies to `http://localhost:8000`.
- `Website/aiviate-engine/src/aiviate/config.py` defaults OSRM to `http://localhost:5000`.
- `Call Agent/Backend/data/orders.json` is still used by Call Agent order endpoints.
- `App/src/data/*` contains driver-app seed data used only when backend mode is not configured.

## Security Problems

- Driver creation and reset currently store and display permanent plaintext generated passwords.
- Driver invitation tokens are not implemented yet.
- Merchant API keys now hash at rest for `/api/integrations/*`, but UI/key lifecycle is not complete.
- Call Agent service authentication has been added for the new APP customer-support API, but old JSON routes remain exposed.
- Retell webhook signature verification has a first implementation, but signature format must be verified against the active Retell configuration before production.
- Root `.env.example` is missing.
- CORS restrictions exist but must be checked per deployment.
- WEB and CALL_AGENT boundaries need enforcement through API-only integrations.

## Build And Test Baseline

Commands run during this audit:

```text
Website: npm run build
Result: passed after installing missing frontend dependency tree locally.
Note: Vite warns that the main bundle is larger than 500 kB.

App: npm test -- --runInBand
Result: failed.
Reason: jest-expo package does not expose the expected Jest preset in the current install.

Call Agent/Backend: npm test
Result: failed by package script placeholder.

Website/aiviate-engine: python -m pytest -q tests/unit/test_order_validation.py tests/unit/test_clustering.py
Result: passed, 15 tests.
```

## Current Blockers

1. The GitHub remote name does not match the user-provided `Aiviate.git` URL; the checked-out remote is `Aviate_Admin.git`.
2. Root developer experience is incomplete: no root README, root `.env.example`, root orchestration or root commands.
3. APP operational state currently uses `Stop` as the order-like persistence model; a dedicated canonical `Order` table is still needed for full product scope.
4. Call Agent legacy `/api/orders/*` remains local-JSON backed and is not safe for production customer queries.
5. Driver invitation/password flow is not secure enough.
6. Driver App login UI exists, but invitation-token activation and password reset still need completion.
7. DEVICE must remain documentation-only until real hardware/software is implemented.

## Migration Decisions

- Preserve the current tracked structure: `App/`, `Website/`, `Call Agent/`.
- Treat `Website/backend` as the APP operational API for now.
- Treat `Website/aiviate-engine` as the deterministic OR-Tools decision engine.
- Add `/api/integrations/*` beside the legacy `/api/store/*` routes instead of deleting the legacy route immediately.
- Use tenant-scoped merchant API keys stored as hashes in `integration_settings`.
- Use the existing `stops` table as an interim canonical order sink only until a dedicated `orders` table is introduced.
- Keep DEVICE as planned documentation only; do not add fake runtime code.

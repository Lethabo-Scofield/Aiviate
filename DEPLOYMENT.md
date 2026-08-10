# Aiviate Deployment

This document describes how to deploy the current repository without pretending unfinished services are complete.

## Deployment Map

| Area | Path | Deployment target | Status |
| --- | --- | --- | --- |
| APP operational web/API | `Website/` | Vercel project root directory: `Website` | Ready for Vercel build with required env vars |
| Decision engine | `Website/aiviate-engine/` | Separate Python/FastAPI service | Required for real route planning |
| Driver app | `App/` | Expo / EAS or local Expo runtime | Not a Vercel web service |
| Call Agent | `Call Agent/Backend/` | Separate Node/Express service | Ready as a service shell with simulation mode |
| Call Agent prototype frontend | `Call Agent/Frontend/` | None | Deprecated local prototype; do not deploy |
| DEVICE | `DEVICE/` | None | Documentation only |

## Azure Production Wiring

Current production endpoints:

```text
Website UI: https://brave-tree-054688510.7.azurestaticapps.net
APP API:    https://aviate-api.azurewebsites.net/api
```

For Azure Static Web Apps, set the Website build environment variable:

```text
VITE_API_URL=https://aviate-api.azurewebsites.net/api
```

The frontend also has a browser-runtime production fallback to the same API URL when it is not running on `localhost`, but the explicit Azure setting is preferred so every build is deterministic.

For the Azure App Service backend, allow the Static Web App origin:

```text
ALLOWED_ORIGINS=https://brave-tree-054688510.7.azurestaticapps.net
PUBLIC_APP_URL=https://brave-tree-054688510.7.azurestaticapps.net
```

Use comma-separated origins if you add a branded domain later.

## Vercel: Website And APP API

Create or update the Vercel project with:

```text
Root Directory: Website
Install Command: npm ci --no-audit --no-fund
Build Command: npm run build
Output Directory: dist
```

`Website/vercel.json` already routes:

```text
/api/* -> api/index.py
/*     -> index.html
```

The Python serverless entry point is:

```text
Website/api/index.py
```

The Flask app factory is:

```text
Website/backend/app.py:create_app
```

## Required Vercel Environment Variables

Set these in Vercel for Production, Preview and Development as appropriate:

```text
DATABASE_URL=
NEON_DATABASE_URL=
JWT_SECRET=
ALLOWED_ORIGINS=
PUBLIC_APP_URL=
DB_CONNECT_TIMEOUT=10
SKIP_DB_INIT=true
ENGINE_URL=
AIVIATE_SERVICE_TOKEN=
MERCHANT_API_RATE_LIMIT_PER_MINUTE=120
```

Notes:

- Use `DATABASE_URL` or `NEON_DATABASE_URL`; both are supported.
- `JWT_SECRET` must be stable across deployments or sessions will be invalidated.
- `ALLOWED_ORIGINS` should be the production site URL and any approved preview origins. Avoid `*` in production.
- `PUBLIC_APP_URL` is used when the backend generates customer tracking links.
- `SKIP_DB_INIT=true` is recommended for serverless cold starts. The current backend still has small compatibility column creation for existing tables, but full schema migration should be moved to a release step.
- `ENGINE_URL` must point to a deployed decision-engine service if route planning should work in production.
- `AIVIATE_SERVICE_TOKEN` must match the Call Agent service token.

## Database Migration

Before production rollout, apply the expanded APP operational schema to the PostgreSQL database:

```bash
psql "$DATABASE_URL" -f Website/backend/migrations/20260810_expand_operational_schema.sql
```

This migration creates more than 80 domain tables for the operational backend, including merchant ingestion, dispatch, driver app, call-agent persistence, safety, future device contracts, idempotency and audit.

Apply the public customer-tracking token table before enabling tracking links:

```bash
psql "$DATABASE_URL" -f Website/backend/migrations/20260810_public_tracking.sql
```

The public-tracking routes lazily create the table if the runtime has DDL permission, but production should use the explicit migration step so schema changes are audited and repeatable.

`psql` is not bundled with this repository. Run the command from a machine or CI job with the PostgreSQL client installed.

## Decision Engine Deployment

The deterministic OR-Tools engine is in:

```text
Website/aiviate-engine
```

It is not bundled into the Vercel frontend/API deployment. Deploy it as a separate Python service using its own Dockerfile or Python runtime.

Required before production route planning:

- Engine service reachable from the APP API over HTTPS.
- Server-side engine API key configured.
- `ENGINE_URL` set in the APP API environment.
- Engine database configured according to `Website/aiviate-engine/README.md`.

Do not expose the engine API key to any browser.

## Call Agent Deployment

The Call Agent backend is in:

```text
Call Agent/Backend
```

Do not deploy `Call Agent/Frontend`. That folder is an old standalone demo UI with hard-coded localhost calls. Customer-facing browser voice support should be implemented inside WEB and should call the Call Agent backend.

Run it as a separate Node service:

```bash
cd "Call Agent/Backend"
npm ci
npm start
```

Required environment:

```text
AIVIATE_API_URL=https://your-aiviate-app.example.com
AIVIATE_SERVICE_TOKEN=
CALL_AGENT_SIMULATION_MODE=true
RETELL_API_KEY=
RETELL_AGENT_ID=
RETELL_FROM_NUMBER=
RETELL_WEBHOOK_SECRET=
```

Keep `CALL_AGENT_SIMULATION_MODE=true` until Retell credentials, webhook signing and approved phone-number policies are verified.

Required endpoint surface:

```text
GET  /health
POST /internal/v1/calls
GET  /internal/v1/calls/{call_id}
POST /webhooks/retell
POST /tools/verify-customer
POST /tools/order-status
POST /tools/request-reschedule
POST /tools/confirm-availability
POST /tools/human-handoff
```

The old `/api/orders/*` JSON-backed demo routes still exist and must not be used as the production order source.

## Driver App Backend Mode

The Driver App lives in:

```text
App
```

It now has a real backend mode. When the API URL is set, the app shows a driver login screen and reads assigned jobs and driver profile data from the APP API:

```text
EXPO_PUBLIC_API_URL=https://aviate-api.azurewebsites.net/api
EXPO_PUBLIC_AIVIATE_API_URL=https://aviate-api.azurewebsites.net/api
EXPO_PUBLIC_AIVIATE_DRIVER_TOKEN=
```

`EXPO_PUBLIC_AIVIATE_DRIVER_TOKEN` is optional and should only be used for local testing. In normal use, drivers sign in through the app and receive a driver JWT from `POST /api/auth/login`. `EXPO_PUBLIC_API_URL` is the canonical Expo variable; `EXPO_PUBLIC_AIVIATE_API_URL` is supported as a compatibility alias. The URL must include `/api`. Without an API URL, the app falls back to local seed data for development and tests.

Real backend endpoints used by the Driver App:

```text
GET  /api/my-jobs
POST /api/my-jobs/{job_id}/start
POST /api/my-jobs/{job_id}/complete/{stop_id}
```

Do not ship production mobile builds with seed data as the intended source. Use seed mode only for local preview and automated tests.

## Merchant API Setup

Admin users can rotate a merchant API key through:

```text
PUT /api/store/integration
```

with:

```json
{
  "rotate_merchant_api_key": true
}
```

The APP API returns the plaintext key once and stores only its hash. Merchant clients then call:

```text
GET  /api/integrations/health
POST /api/integrations/orders
POST /api/integrations/orders/bulk
GET  /api/integrations/orders/{external_order_id}
```

Required headers:

```text
X-Aiviate-Merchant-Key: <merchant key>
Idempotency-Key: <stable request key>
X-Correlation-ID: <optional trace id>
```

## Public Customer Tracking

Admins can generate a customer-safe tracking link from an expanded job stop in the Website. The token is returned only once, copied to the clipboard where the browser allows it, and only a SHA-256 hash is stored.

Public endpoints:

```text
GET  /api/public/tracking/{token}
POST /api/public/tracking/{token}/reschedule
POST /api/public/tracking/{token}/availability
```

Admin endpoints:

```text
GET  /api/stops/{stop_id}/tracking-link
POST /api/stops/{stop_id}/tracking-link
POST /api/stops/{stop_id}/tracking-link/revoke
```

The public response intentionally excludes customer phone numbers, private notes, internal stop IDs, driver contact details and precise driver GPS history.

## Release Checks

Run these before deploying:

```bash
cd Website
npm ci
npm run build
python -m py_compile backend/app.py backend/models.py backend/routes/orders.py backend/routes/support.py backend/routes/drivers.py
```

```bash
cd App
npm ci
npm test -- --runInBand
```

```bash
cd Website/aiviate-engine
python -m pytest -q tests/unit/test_order_validation.py tests/unit/test_clustering.py
```

```bash
cd "Call Agent/Backend"
npm ci
node --check server.js
node --check routes/tools.js
node --check routes/calls.js
node --check routes/webhooks.js
node --check services/aiviateClient.js
```

Known current note: the full decision-engine pytest suite may need a longer CI timeout than three minutes.

## Production Readiness Checklist

- Real `DATABASE_URL` or `NEON_DATABASE_URL` configured.
- Expanded operational schema migration applied.
- Stable `JWT_SECRET` configured.
- `ALLOWED_ORIGINS` restricted to approved domains.
- Decision engine deployed and reachable by `ENGINE_URL`.
- Call Agent deployed separately with matching `AIVIATE_SERVICE_TOKEN`.
- Retell credentials configured only when ready to leave simulation mode.
- Merchant API keys generated through APP and stored by merchants outside the repo.
- Driver App configured with `EXPO_PUBLIC_API_URL`; drivers use the login screen for JWT auth.
- No real secrets committed.
- `DEVICE/` remains documentation only.

## Known Gaps Before Full Ecosystem Production

- WEB merchant simulator is not yet separated from the admin `Website/` surface.
- Dedicated operational `Order` table is still needed; merchant ingestion currently persists through the existing `stops` model.
- Driver invitation activation links are not complete.
- Durable Call Agent call/webhook persistence is not complete.
- Route-change event workflow and driver notifications need the next implementation pass.

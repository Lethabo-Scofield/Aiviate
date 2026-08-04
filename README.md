# Aiviate

Aiviate is a last-mile delivery operations system.

Simple product promise:

> Connect your orders. Aiviate plans, dispatches, monitors and adapts every last-mile delivery.

## Repository Layout

```text
.
+-- App/          Driver-facing Expo / React Native app
+-- Website/      Admin web UI, operational Flask API and decision engine
+-- Call Agent/   Retell-based customer support call agent
+-- DEVICE/       Planned device documentation only
+-- contracts/    Shared JSON Schema event contracts
+-- docs/         Current-state and deployment documentation
```

## What Is Deployable Today

The primary deployable service is `Website/`.

It contains:

- Vite React admin UI
- Flask operational API mounted through `Website/api/index.py`
- Vercel config at `Website/vercel.json`
- PostgreSQL persistence through `DATABASE_URL` or `NEON_DATABASE_URL`
- Merchant ingestion API under `/api/integrations/*`
- Customer-support API under `/api/customer-support/*`

The deterministic decision engine lives in `Website/aiviate-engine/` and should run as its own Python service. The APP backend calls it through `ENGINE_URL`.

The Call Agent lives in `Call Agent/Backend/` and should run as its own Node service. It calls APP through `AIVIATE_API_URL` and `AIVIATE_SERVICE_TOKEN`.

The `DEVICE/` area is documentation only. It is not a runnable service.

## Local Quick Start

Install and build the deployable web/admin service:

```bash
cd Website
npm ci
npm run build
```

Run the Flask APP API locally:

```bash
cd Website
pip install -r backend/requirements.txt
python backend/app.py
```

Run the admin UI locally:

```bash
cd Website
npm run dev
```

Run the driver app tests:

```bash
cd App
npm ci
npm test -- --runInBand
```

Run focused decision-engine tests:

```bash
cd Website/aiviate-engine
python -m pytest -q tests/unit/test_order_validation.py tests/unit/test_clustering.py
```

## Required Environment

Copy `.env.example` and configure real values in your deployment provider. Do not commit real secrets.

Minimum for the APP API:

```text
DATABASE_URL=
JWT_SECRET=
ALLOWED_ORIGINS=
ENGINE_URL=
AIVIATE_SERVICE_TOKEN=
```

Minimum for the Call Agent:

```text
AIVIATE_API_URL=
AIVIATE_SERVICE_TOKEN=
CALL_AGENT_SIMULATION_MODE=true
RETELL_API_KEY=
RETELL_AGENT_ID=
RETELL_FROM_NUMBER=
RETELL_WEBHOOK_SECRET=
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Vercel setup, service boundaries, environment variables and release checks.

## Current State

See [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) for the latest audit of what exists, what is wired, and what is still planned.

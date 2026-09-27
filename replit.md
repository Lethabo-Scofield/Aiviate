# Aiviate Dispatch

A logistics dispatch app for managing orders, drivers, delivery routes, fleet operations, and public tracking.

## Run & operate

- The managed `artifacts/aiviate-dispatch: web` workflow serves the original Vite/React frontend at `/`.
- The managed `artifacts/api-server: API Server` workflow serves the original Flask REST API at `/api` and starts its private FastAPI route-planning engine on localhost:8099. Start/restart both workflows to use the app.
- Frontend build: `PORT=19317 BASE_PATH=/ pnpm --filter @workspace/aiviate-dispatch run build`.
- Python dependencies are recorded in the root `pyproject.toml` and `uv.lock`; the API workflow uses `uv run`. Do not use the scaffold's unused Express routes for product features.

## Project layout

- `artifacts/aiviate-dispatch/src/`: imported pages, components, theme, routes, and API client. `src/App.jsx` is the active React Router entry.
- `artifacts/api-server/backend/`: imported Flask app and data model.
- `artifacts/api-server/aiviate-engine/`: imported route-planning engine.
- `artifacts/api-server/run_services.py`: starts both Python services for the API artifact.
- `.migration-backup/`: untouched imported source for comparison.

## Data and configuration

The Flask app uses `NEON_DATABASE_URL` if supplied, otherwise `DATABASE_URL`, with its original local fallback. The import did not move records from the source database. Set the original database connection as a Replit secret if the app needs to show those records; do not copy values from imported environment files into source.

`SESSION_SECRET` is available for persistent JWT signing when `JWT_SECRET` is unset. The planner generates its own private local key on first start. Keep that key and its local SQLite file out of Git.
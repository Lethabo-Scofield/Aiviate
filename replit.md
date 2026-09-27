# Aiviate Dispatch

A logistics dispatch app for managing orders, drivers, delivery routes, fleet operations, and public tracking.

## Run & operate

- The managed `artifacts/aiviate-dispatch: web` workflow serves the original Vite/React frontend at `/`.
- The managed `artifacts/aiviate-driver: expo` workflow serves the separate imported Expo / React Native driver app. Select the **Aiviate Driver** mobile artifact to preview the actual driver app; the website's driver-role pages are not that app.
- The managed `artifacts/api-server: API Server` workflow serves the original Flask REST API at `/api` and starts its private FastAPI route-planning engine on localhost:8099. Start/restart both workflows to use the app.
- Frontend build: `PORT=19317 BASE_PATH=/ pnpm --filter @workspace/aiviate-dispatch run build`.
- Vercel uses the root `pyproject.toml` entrypoint (`vercel_app.py`) and its build script to serve the same website and Flask API as one serverless function. The local route-planning engine is not started by Vercel; engine-dependent actions require a separately hosted engine.
- Python dependencies are recorded in the root `pyproject.toml` and `uv.lock`; the API workflow uses `uv run`. Do not use the scaffold's unused Express routes for product features.

## Project layout

- `artifacts/aiviate-dispatch/src/`: imported pages, components, theme, routes, and API client. `src/App.jsx` is the active React Router entry.
- `artifacts/aiviate-driver/`: imported driver mobile app (`App.js`, `src/`, and original assets). It uses the original React Navigation entrypoint, not the unused Expo Router scaffold screens.
- `artifacts/api-server/backend/`: imported Flask app and data model.
- `artifacts/api-server/aiviate-engine/`: imported route-planning engine.
- `artifacts/api-server/run_services.py`: starts both Python services for the API artifact.
- `.migration-backup/`: original Vercel project layout for comparison and Vercel redeployment; its duplicate API entrypoints have been consolidated into a single catch-all function.

## Data and configuration

The Flask app uses `NEON_DATABASE_URL` if supplied, otherwise `DATABASE_URL`, with its original local fallback. The import did not move records from the source database. Set the original database connection as a Replit secret if the app needs to show those records; do not copy values from imported environment files into source.

The driver app uses the original live API for driver accounts and jobs, not the Replit development database. Expo web Preview calls the restricted, development-only `/api/live-driver` relay because the live API does not permit cross-origin browser requests. Native Expo clients connect directly to the live API. Do not send users' driver passwords through chat or copy them into source.

`SESSION_SECRET` is available for persistent JWT signing when `JWT_SECRET` is unset. The planner generates its own private local key on first start. Keep that key and its local SQLite file out of Git.
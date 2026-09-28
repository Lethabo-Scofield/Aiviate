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

The driver app uses the original live API for driver accounts and jobs, not the Replit development database. Both browser Preview and Expo Go in this workspace call the restricted, development-only `/api/live-driver` relay through the Expo Preview domain, avoiding cross-origin and separate-development-domain failures. Builds outside Preview connect directly to the live API. Do not send users' driver passwords through chat or copy them into source.

Gmail is the only live operational third-party integration in the Dispatch website. Other listed services are usable as clearly labeled simulations backed by sample records: they can be selected in Tools and the slash picker to explore demo responses, but must never imply an external account is connected, access live provider data, or perform live actions. The built-in order source and developer REST API are separate platform features, not third-party connections. Voice mode uses Replit's OpenAI audio integration to narrate real company snapshot data and answer read-only questions; it does not call suppliers or place orders. Its audio usage is charged to Replit credits, not to a displayed Aiviate or Retell balance.
On the Integrations screen and its chat tools, use concise "sample data / not connected" disclosure rather than repeated "Demo" badges. Keep the distinction from genuinely connected accounts visible.
In Operations chat, selecting an integration tool keeps the user in the conversation. Pending activity must describe the actual request (such as reading sample provider data or searching a connected inbox); do not invent timed tool steps or show a typewriter animation after a complete response arrives.

The Dispatch Drivers > Map view should show real street-map tiles and road routes, not schematic traffic scenarios. `/api/live-ops` can return simulated driver coordinates: never display those as driver GPS or route from them. Road checks without driver GPS must use explicitly user-chosen points, and agent activity should reflect an actual routing request rather than pretend live traffic or tracking.

`SESSION_SECRET` is available for persistent JWT signing when `JWT_SECRET` is unset. The planner generates its own private local key on first start. Keep that key and its local SQLite file out of Git.
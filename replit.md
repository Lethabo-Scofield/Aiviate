# Aiviate Dispatch System

A multi-tenant logistics SaaS application for managing delivery routes, drivers, and stops. Features route optimization via Google OR-Tools and interactive map visualizations with Leaflet.

## Architecture

- **Frontend** (`/src`): React 19 SPA built with Vite and Tailwind CSS, served on port 5000
- **Backend** (`/backend`): Python Flask REST API, served on port 8000
- **Database**: PostgreSQL via Neon (external)

## Deployment

### Vercel (Production)
The app deploys as a single Vercel project — frontend as static files and backend as a Python serverless function.

- `vercel.json` — routing and build config
- `api/index.py` — Vercel serverless entry point, wraps the Flask app
- `requirements.txt` — Python dependencies for Vercel runtime
- `/api/*` requests are routed to the Python serverless function
- All other requests serve the React SPA

Environment variables to set on Vercel: `NEON_DATABASE_URL`, `JWT_SECRET`

### Replit (Development)
Three workflows run in parallel:
- **Start application** — Vite dev server (port 5000), proxies `/api` requests to the backend
- **Backend API** — Flask server (port 8000)
- **AI Engine** — FastAPI/uvicorn service (port 8080)

Database: Replit built-in PostgreSQL (`DATABASE_URL`, used as fallback when `NEON_DATABASE_URL` is unset).

### Replit (Publishing)
Autoscale deployment: `npm run build` then `gunicorn main:app` on port 5000 — serves the built React app and Flask API from one process. Note: the AI Engine (port 8080) is NOT started in this deployment, so engine-backed routes will be unavailable in production until it is deployed as a separate service (set `ENGINE_URL` accordingly).

Note: `JWT_SECRET` is stored as a shared environment variable (rotated during the Replit migration on 2026-07-12; the previous value committed in `.replit` git history should be considered leaked). The `aiviate-engine` package declares Python >=3.12 but currently runs fine on the installed Python 3.11.

## Key Files

- `backend/app.py` — Flask app factory, registers all blueprints, runs DB migrations
- `backend/config.py` — Reads `NEON_DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS` from env
- `backend/models.py` — SQLAlchemy models (NullPool for serverless compatibility): Companies, Users, Drivers, Jobs, Stops
- `backend/routes/` — API blueprints: auth, jobs, drivers, stops, optimization, stats, orders
- `backend/orders_source.py` — read-only connection to the external e-commerce orders DB (`ORDERS_DATABASE_KEY`)
- `backend/routes/orders.py` — `GET /api/store/orders` (list store orders) and `POST /api/store/orders/import` (import as stops; geocodes missing coords, dedupe enforced by partial unique index on `stops(company_id, order_id)` for `STORE-%` order IDs). Access is restricted to the company in `ORDERS_COMPANY_ID` (falls back to allowing only single-company deployments).
- `backend/optimize_route.py` — TSP route optimization using Google OR-Tools
- `src/App.jsx` — React router: public (Login/Register) and protected routes
- `src/services/api.js` — Centralized API client with JWT auth headers, supports `VITE_API_URL` env var
- `src/contexts/AuthContext.jsx` — Auth state and session persistence
- `vite.config.js` — Vite config with proxy to backend and `allowedHosts: true`

## Environment Variables

| Variable | Description |
|---|---|
| `NEON_DATABASE_URL` | PostgreSQL connection string (Neon) |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `ALLOWED_ORIGINS` | CORS allowed origins (default: `*`) |
| `ORDERS_DATABASE_KEY` | Connection string for the external e-commerce orders database (Neon, read-only usage) |
| `ORDERS_COMPANY_ID` | Company allowed to access the store orders integration (dev: `CMP-DEMO0001`) |

## Dependencies

- **Frontend**: React 19, Vite, Tailwind CSS, Leaflet/React-Leaflet, react-router-dom, papaparse, xlsx, lucide-react
- **Backend**: Flask, Flask-CORS, SQLAlchemy, psycopg2-binary, ortools, numpy, pandas, geopy, PyJWT, bcrypt

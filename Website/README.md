# Aiviate Dispatch System

A multi-tenant logistics dispatch SaaS for managing delivery routes in Johannesburg.

## Features

- **Excel Upload** — Upload delivery addresses, auto-geocoded via Nominatim
- **Route Optimization** — Clusters stops geographically, optimizes with Google OR-Tools
- **Driver Management** — Add drivers with auto-created login credentials
- **Driver App** — Drivers view assigned jobs and mark deliveries complete
- **Multi-Tenant** — Company data fully isolated via tenant scoping
- **JWT Auth** — Role-based access control (admin / driver)

## Quick Start

1. Set environment variables: `NEON_DATABASE_URL`, `JWT_SECRET`
2. Install dependencies: `pip install -r backend/requirements.txt` and `npm install`
3. Start backend: `cd backend && python app.py`
4. Start frontend: `npm run dev`

See `SYSTEM_DOCUMENTATION.md` for full API docs, database schema, and deployment guide.

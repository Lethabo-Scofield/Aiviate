# Aiviate Dispatch — System Documentation

## Overview

Aiviate is a multi-tenant logistics dispatch SaaS platform for managing delivery routes, drivers, and stops. It provides route optimization, driver management, real-time delivery tracking, and interactive map visualization.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│            React 19 + Vite + Tailwind               │
│                  Port 5000                           │
│                                                     │
│  /login  /register  /dashboard  /dispatch            │
│  /jobs   /drivers   /map        /my-jobs             │
└──────────────┬──────────────────────────────────────┘
               │  Vite Proxy (/api → :8000)
               ▼
┌─────────────────────────────────────────────────────┐
│                   Backend API                        │
│              Python Flask + SQLAlchemy               │
│                   Port 8000                          │
│                                                     │
│  Blueprints: auth, jobs, drivers, stops,             │
│              optimization, stats                     │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│                   PostgreSQL                         │
│               Neon (cloud-hosted)                    │
│                                                     │
│  Tables: companies, users, drivers, jobs, stops      │
└─────────────────────────────────────────────────────┘
```

### External Services

| Service | Purpose |
|---------|---------|
| Neon PostgreSQL | Primary database |
| Nominatim (OpenStreetMap) | Address geocoding |
| OSRM | Road routing and geometry |
| Google OR-Tools | Route optimization (TSP solver) |

---

## Database Schema

### companies
| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | String | No (PK) | — | Generated as `CMP-` + 8 hex chars |
| name | String | No | — | Company display name |
| domain | String | Yes | — | Email domain (auto-extracted at registration) |
| created_at | DateTime | Yes | UTC now | Creation timestamp |

### users
| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | String | No (PK) | — | Generated as `USR-` + 8 hex chars |
| email | String (unique) | No | — | Login email |
| password_hash | String | No | — | bcrypt hash |
| name | String | No | — | Display name |
| role | String | Yes | `"admin"` | `admin` or `driver` |
| company_id | String (FK → companies.id) | No | — | Tenant scope |
| driver_id | String (FK → drivers.id) | Yes | — | Links to driver profile (driver role only) |
| created_at | DateTime | Yes | UTC now | Creation timestamp |

### drivers
| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | String | No (PK) | — | Generated as `DRV-` + 6 hex chars |
| name | String | No | — | Driver name |
| email | String | Yes | `""` | Driver email |
| vehicle_type | String | Yes | `"van"` | `van`, `truck`, `car`, or `bike` |
| status | String | Yes | `"available"` | Driver availability status |
| blocked | Boolean | Yes | `false` | Whether driver is blocked from access |
| last_generated_password | String | Yes | — | Last auto-generated password (plaintext for admin visibility) |
| company_id | String (FK → companies.id) | Yes | — | Tenant scope |
| user_id | String | Yes | — | Associated user account ID |
| created_at | DateTime | Yes | UTC now | Creation timestamp |

### jobs
| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | String | No (PK) | — | Generated as `JOB-` + 6 hex chars |
| area | String | Yes | — | Geographic area name (from geocoding) |
| total_stops | Integer | Yes | `0` | Number of stops in this job |
| total_distance_km | Float | Yes | `0` | Total route distance in km |
| estimated_time_min | Integer | Yes | `0` | Estimated completion time in minutes |
| estimated_cost | Float | Yes | `0` | Cost estimate: `(km × 12) + (min × 2.5)` |
| center_lat | Float | Yes | — | Cluster center latitude |
| center_lng | Float | Yes | — | Cluster center longitude |
| status | String | Yes | `"unassigned"` | `unassigned`, `assigned`, or `completed` |
| driver_id | String (FK → drivers.id) | Yes | — | Assigned driver |
| driver_name | String | Yes | — | Driver name (denormalized for display) |
| assigned_at | DateTime | Yes | — | When driver was assigned |
| completed_at | DateTime | Yes | — | When all stops were completed |
| route_geometry | Text | Yes | — | Encoded polyline from OSRM |
| company_id | String (FK → companies.id) | Yes | — | Tenant scope |
| created_at | DateTime | Yes | UTC now | Creation timestamp |

### stops
| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | String | No (PK) | — | Unique stop ID (8 hex chars or prefixed) |
| order_id | String | Yes | — | External order reference |
| customer_name | String | Yes | — | Recipient name |
| address | String | Yes | — | Full delivery address |
| lat | Float | Yes | — | Latitude |
| lng | Float | Yes | — | Longitude |
| demand | Integer | Yes | `1` | Delivery size/weight unit |
| service_time | Integer | Yes | `15` | Minutes at stop |
| phone | String | Yes | `""` | Contact phone |
| notes | Text | Yes | `""` | Delivery notes |
| time_window_start | String | Yes | `""` | Earliest delivery time |
| time_window_end | String | Yes | `""` | Latest delivery time |
| job_id | String (FK → jobs.id) | Yes | — | Assigned job |
| stop_number | Integer | Yes | `0` | Order within the job route |
| completed | Boolean | Yes | `false` | Whether stop is delivered |
| completed_at | DateTime | Yes | — | Completion timestamp |
| company_id | String (FK → companies.id) | Yes | — | Tenant scope |
| created_at | DateTime | Yes | UTC now | Creation timestamp |

---

## Multi-Tenancy

All data is scoped by `company_id`. Every authenticated request includes the user's `company_id` in the JWT token, and all queries filter by it. This ensures complete data isolation between companies.

---

## Authentication & Authorization

### JWT Tokens
- Tokens are issued on login/register and expire after 30 days
- Payload includes: `user_id`, `company_id`, `email`, `role`, `driver_id`
- Signed with `JWT_SECRET` environment variable

### Roles
| Role | Access |
|------|--------|
| `admin` | Full access: manage drivers, jobs, stops, optimization |
| `driver` | Limited: view assigned jobs, mark stops as complete |

### Middleware
- `require_auth` — Validates JWT token, extracts user info, checks blocked status for drivers
- `require_admin` — Ensures the user has the `admin` role

### Driver Blocking
When a driver is blocked:
1. They cannot log in (checked at `/api/auth/login`)
2. Existing sessions are rejected on every request (checked in `require_auth` middleware)
3. A "BLOCKED" badge appears on the driver list and detail view

---

## Route Optimization Flow

1. **Upload** — Admin uploads Excel/CSV with delivery addresses
2. **Geocode** — Addresses are geocoded via Nominatim (OpenStreetMap)
3. **Cluster** — Stops are grouped by geographic proximity (configurable radius, default 8km)
4. **Optimize** — Each cluster is solved as a TSP using Google OR-Tools
5. **Route** — OSRM generates road-following geometry for map display
6. **Assign** — Admin assigns optimized jobs to drivers
7. **Track** — Drivers mark stops complete; job auto-completes when all stops are done

### Clustering Algorithm
- Iterates through stops sorted by coordinates
- Groups stops within the configured radius (haversine distance)
- Each cluster becomes a separate job

### TSP Solver
- Uses OR-Tools `RoutingModel` with `PATH_CHEAPEST_ARC` strategy
- 10-second time limit per cluster
- Falls back to insertion order for very small clusters (< 3 stops)

### Cost Estimation
```
cost = (distance_km × 12) + (time_min × 2.5)
time_min = (distance_km / 35 × 60) + sum(service_times)
```

---

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Login | Email/password sign-in |
| `/register` | Register | Create new account + company |
| `/dashboard` | Dashboard | Stats overview with key metrics |
| `/dispatch` | Dispatch Center | Upload, optimize, and manage dispatch workflow |
| `/jobs` | Jobs | View and manage all optimized jobs |
| `/drivers` | Drivers | Driver list with detail panel (info, credentials, block, deliveries) |
| `/map` | Map View | Interactive Leaflet map with route visualization |
| `/my-jobs` | My Jobs | Driver-facing view of assigned jobs and stop completion |
| `/profile` | Profile | User profile settings |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEON_DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | JWT signing secret (auto-generated if missing) |
| `ALLOWED_ORIGINS` | No | CORS allowed origins (default: `*`) |
| `FLASK_DEBUG` | No | Enable Flask debug mode (`true`/`false`) |
| `VITE_API_URL` | No | Frontend API base URL (default: `/api`) |

---

## Deployment

### Replit (Current)
In development, two workflows run in parallel:
1. **Start application** — `npm run dev` (Vite on port 5000, proxies `/api` to port 8000)
2. **Backend API** — `cd backend && python3 app.py` (Flask on port 8000)

### External Deployment

**Frontend (Vercel):**
1. Connect repository
2. Set `VITE_API_URL` to backend URL + `/api`
3. Build command: `npm run build`, output: `dist/`

**Backend (Render):**
1. Root directory: `backend/`
2. Set env vars: `NEON_DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`
3. Start command: `cd backend && gunicorn --bind 0.0.0.0:$PORT wsgi:app`
4. Uses `backend/render.yaml` for auto-configuration

---

## File Structure

```
├── src/                          # React frontend
│   ├── components/               # Shared UI components
│   │   ├── Layout.jsx            # Main layout with sidebar
│   │   ├── Sidebar.jsx           # Navigation sidebar
│   │   ├── ProtectedRoute.jsx    # Auth guard for routes
│   │   ├── DriverLayout.jsx      # Layout for driver-role users
│   │   └── Loader.jsx            # Spinner and skeleton components
│   ├── contexts/
│   │   └── AuthContext.jsx       # Authentication state management
│   ├── pages/
│   │   ├── Dashboard.jsx         # Stats overview
│   │   ├── DispatchCenter.jsx    # Upload/optimize/assign workflow
│   │   ├── Jobs.jsx              # Job list and management
│   │   ├── Drivers.jsx           # Driver list + detail panel
│   │   ├── MapView.jsx           # Interactive map with routes
│   │   ├── MyJobs.jsx            # Driver's assigned jobs
│   │   ├── Login.jsx             # Login form
│   │   ├── Register.jsx          # Registration form
│   │   └── Profile.jsx           # User profile
│   ├── services/
│   │   └── api.js                # API client (fetch wrapper)
│   ├── App.jsx                   # Router configuration
│   ├── main.jsx                  # React entry point
│   └── index.css                 # Global styles + Tailwind
├── backend/                      # Flask backend
│   ├── app.py                    # App factory + migrations
│   ├── config.py                 # Environment config
│   ├── middleware.py             # Auth decorators
│   ├── models.py                 # SQLAlchemy models
│   ├── utils.py                  # Utilities (JWT, haversine, clustering)
│   ├── optimize_route.py         # OR-Tools optimization
│   ├── wsgi.py                   # Gunicorn entry point
│   ├── requirements.txt          # Python dependencies
│   ├── routes/
│   │   ├── __init__.py           # Blueprint definitions
│   │   ├── auth.py               # Authentication endpoints
│   │   ├── jobs.py               # Job management endpoints
│   │   ├── drivers.py            # Driver management endpoints
│   │   ├── stops.py              # Stop listing endpoint
│   │   ├── optimization.py       # Upload, optimize, routing
│   │   └── stats.py              # Statistics endpoint
│   └── data/
│       ├── test_stops.json       # Sample delivery data (Johannesburg)
│       └── areas.json            # Area name definitions
├── docs/                         # Documentation
│   ├── API.md                    # API reference
│   └── SYSTEM.md                 # System documentation
├── public/                       # Static assets
├── package.json                  # Frontend dependencies
├── vite.config.js                # Vite configuration
├── index.html                    # HTML entry point
└── replit.md                     # Replit project memory
```

---

## Dependencies

### Frontend (npm)
| Package | Purpose |
|---------|---------|
| react, react-dom | UI framework |
| react-router-dom | Client-side routing |
| tailwindcss | Utility-first CSS |
| leaflet, react-leaflet | Interactive maps |
| lucide-react | Icon library |
| papaparse | CSV parsing |
| xlsx | Excel file reading |

### Backend (pip)
| Package | Purpose |
|---------|---------|
| flask | Web framework |
| flask-cors | Cross-origin resource sharing |
| sqlalchemy | ORM / database |
| psycopg2-binary | PostgreSQL driver |
| ortools | Route optimization (TSP) |
| geopy | Geocoding |
| pandas, openpyxl | Data processing / Excel |
| PyJWT | JSON Web Tokens |
| bcrypt | Password hashing |
| gunicorn | Production WSGI server |
| requests | HTTP client (OSRM calls) |
| numpy | Numerical operations |

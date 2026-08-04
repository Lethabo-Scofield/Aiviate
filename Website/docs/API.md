# Aiviate Dispatch API Reference

Base URL: `/api`

All endpoints return JSON. Authenticated endpoints require a `Authorization: Bearer <token>` header.

---

## Authentication

### POST /api/auth/register

Create a new account and company.

**Body:**
```json
{
  "name": "John Doe",
  "email": "john@company.com",
  "password": "securepass",
  "company_name": "Acme Logistics"
}
```

**Response (201):**
```json
{
  "success": true,
  "token": "eyJhbG...",
  "user": {
    "id": "USR-A1B2C3D4",
    "email": "john@company.com",
    "name": "John Doe",
    "role": "admin",
    "company_id": "CMP-X1Y2Z3W4",
    "company_name": "Acme Logistics",
    "driver_id": null,
    "created_at": "2026-04-13T10:00:00"
  }
}
```

**Errors:**
- `400` — Missing required fields or password too short (min 6 chars)
- `409` — Email already registered

---

### POST /api/auth/login

Sign in with email and password.

**Body:**
```json
{
  "email": "john@company.com",
  "password": "securepass"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbG...",
  "user": { ... }
}
```

**Errors:**
- `400` — Missing email or password
- `401` — Invalid credentials
- `403` — Driver account is blocked

---

### GET /api/auth/me

Get the currently authenticated user's profile.

**Auth:** Required

**Response (200):**
```json
{
  "user": {
    "id": "USR-A1B2C3D4",
    "email": "john@company.com",
    "name": "John Doe",
    "role": "admin",
    "company_id": "CMP-X1Y2Z3W4",
    "company_name": "Acme Logistics",
    "driver_id": null,
    "created_at": "2026-04-13T10:00:00"
  }
}
```

---

## Drivers

### GET /api/drivers

List all drivers in the company.

**Auth:** Required (Admin only)

**Response (200):**
```json
{
  "drivers": [
    {
      "id": "DRV-A1B2C3",
      "name": "Sipho Ndlovu",
      "email": "sipho@gmail.com",
      "vehicle_type": "van",
      "status": "available",
      "blocked": false,
      "has_account": true,
      "created_at": "2026-04-13T10:00:00"
    }
  ]
}
```

---

### POST /api/drivers

Add a new driver. Automatically creates a login account for the driver.

**Auth:** Required (Admin only)

**Body:**
```json
{
  "name": "Sipho Ndlovu",
  "email": "sipho@gmail.com",
  "vehicle_type": "van",
  "password": ""
}
```

- `vehicle_type` — One of: `van`, `truck`, `car`, `bike` (default: `van`)
- `password` — Optional. Auto-generated if left empty.

**Response (201):**
```json
{
  "success": true,
  "driver": {
    "id": "DRV-A1B2C3",
    "name": "Sipho Ndlovu",
    "email": "sipho@gmail.com",
    "vehicle_type": "van",
    "status": "available",
    "blocked": false,
    "has_account": true,
    "generated_password": "a1b2c3d4",
    "created_at": "2026-04-13T10:00:00"
  }
}
```

**Errors:**
- `400` — Missing name or email
- `409` — Email already in use

---

### GET /api/drivers/<driver_id>

Get detailed driver information including stats, credentials, and job history.

**Auth:** Required (Admin only)

**Response (200):**
```json
{
  "driver": {
    "id": "DRV-A1B2C3",
    "name": "Sipho Ndlovu",
    "email": "sipho@gmail.com",
    "vehicle_type": "van",
    "status": "available",
    "blocked": false,
    "has_account": true,
    "last_generated_password": "a1b2c3d4",
    "total_jobs": 5,
    "completed_jobs": 3,
    "active_jobs": 1,
    "total_stops_completed": 28,
    "total_stops_assigned": 35,
    "created_at": "2026-04-13T10:00:00",
    "jobs": [ ... ]
  }
}
```

**Errors:**
- `404` — Driver not found

---

### DELETE /api/drivers/<driver_id>

Remove a driver and their login account. Unassigns all their jobs.

**Auth:** Required (Admin only)

**Response (200):**
```json
{ "success": true }
```

---

### POST /api/drivers/<driver_id>/block

Toggle block/unblock a driver. Blocked drivers cannot log in or make API requests.

**Auth:** Required (Admin only)

**Response (200):**
```json
{
  "success": true,
  "blocked": true,
  "driver": { ... }
}
```

---

### POST /api/drivers/<driver_id>/reset-password

Generate a new password for a driver. The old password is immediately invalidated.

**Auth:** Required (Admin only)

**Response (200):**
```json
{
  "success": true,
  "new_password": "e5f6g7h8"
}
```

---

### GET /api/drivers/<driver_id>/deliveries

Get a driver's delivery history with completion progress per job.

**Auth:** Required (Admin only)

**Response (200):**
```json
{
  "driver_id": "DRV-A1B2C3",
  "deliveries": [
    {
      "job": {
        "id": "JOB-X1Y2Z3",
        "area": "Sandton",
        "status": "completed",
        "total_stops": 5,
        "total_distance_km": 12.3,
        "completed_at": "2026-04-13T15:30:00",
        "stops": [ ... ]
      },
      "total_stops": 5,
      "completed_stops": 5,
      "completion_pct": 100
    }
  ]
}
```

---

## Jobs

### GET /api/jobs

List all jobs for the company.

**Auth:** Required (Admin only)

**Response (200):**
```json
{
  "jobs": [
    {
      "id": "JOB-X1Y2Z3",
      "area": "Sandton",
      "total_stops": 5,
      "total_distance_km": 12.3,
      "estimated_time_min": 45,
      "estimated_cost": 260.50,
      "center_lat": -26.1076,
      "center_lng": 28.0567,
      "status": "unassigned",
      "driver_id": null,
      "driver_name": null,
      "route_geometry": "encoded_polyline...",
      "assigned_at": null,
      "completed_at": null,
      "created_at": "2026-04-13T10:00:00",
      "stops": [ ... ]
    }
  ]
}
```

---

### POST /api/jobs/<job_id>/assign

Assign a driver to a job.

**Auth:** Required (Admin only)

**Body:**
```json
{ "driver_id": "DRV-A1B2C3" }
```

**Response (200):**
```json
{
  "success": true,
  "job": { ... }
}
```

---

### POST /api/jobs/<job_id>/unassign

Remove the driver assignment from a job.

**Auth:** Required (Admin only)

**Response (200):**
```json
{
  "success": true,
  "job": { ... }
}
```

---

## Stops

### GET /api/stops

List all stops for the company.

**Auth:** Required (Admin only)

**Response (200):**
```json
{
  "stops": [
    {
      "id": "abc12345",
      "order_id": "ORD-001",
      "customer_name": "John Smith",
      "address": "123 Main St, Johannesburg",
      "lat": -26.2041,
      "lng": 28.0473,
      "demand": 1,
      "service_time": 15,
      "phone": "+27123456789",
      "notes": "Ring bell",
      "time_window_start": "08:00",
      "time_window_end": "12:00",
      "job_id": "JOB-X1Y2Z3",
      "stop_number": 1,
      "completed": false,
      "completed_at": null
    }
  ]
}
```

---

## Optimization

### POST /api/upload

Upload an Excel (.xlsx, .xls) or CSV file with delivery addresses. Geocodes addresses and stores them as stops.

**Auth:** Required (Admin only)

**Body:** `multipart/form-data` with a `file` field.

The file must contain a `Full_Address` (or `address`) column. Optional columns: `Order_ID`, `Customer_Name`, `Demand`, `Service_Time`, `Phone`, `Notes`, `Time_Window_Start`, `Time_Window_End`.

**Response (200):**
```json
{
  "success": true,
  "total_rows": 20,
  "geocoded": 18,
  "failed": 2,
  "failed_details": [
    { "row": 5, "address": "invalid address", "reason": "Could not geocode" }
  ],
  "stops": [ ... ]
}
```

---

### POST /api/optimize

Run route optimization on uploaded stops. Groups stops into area clusters and solves TSP (Travelling Salesman Problem) for each cluster using Google OR-Tools.

**Auth:** Required (Admin only)

**Body:**
```json
{
  "cluster_radius": 8,
  "stops": []
}
```

- `cluster_radius` — Grouping radius in km (default: 8)
- `stops` — Optional. If provided, uses these stops instead of database stops.

**Response (200):**
```json
{
  "success": true,
  "total_stops": 20,
  "total_jobs": 4,
  "jobs": [ ... ]
}
```

---

### POST /api/route

Get road routing geometry between waypoints using OSRM.

**Auth:** Required (Admin only)

**Body:**
```json
{
  "waypoints": [
    [-26.2041, 28.0473],
    [-26.1076, 28.0567]
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "geometry": "encoded_polyline...",
  "distance": 15234,
  "duration": 1200
}
```

---

## Statistics

### GET /api/stats

Get dashboard statistics for the company.

**Auth:** Required (Admin only)

**Response (200):**
```json
{
  "total_jobs": 10,
  "unassigned": 4,
  "assigned": 3,
  "completed": 3,
  "total_stops": 50,
  "total_distance_km": 120.5,
  "total_estimated_cost": 2500.00,
  "total_drivers": 5
}
```

---

## Driver App Endpoints

These endpoints are for drivers using their own accounts (role: `driver`).

### GET /api/my-jobs

Get jobs assigned to the currently logged-in driver.

**Auth:** Required (Driver)

**Response (200):**
```json
{
  "driver": { ... },
  "jobs": [ ... ]
}
```

---

### POST /api/my-jobs/<job_id>/complete/<stop_id>

Mark a stop as completed by the driver.

**Auth:** Required (Driver)

**Response (200):**
```json
{
  "success": true,
  "stop": { ... },
  "job_status": "assigned"
}
```

---

### GET /api/driver/<driver_id>/jobs

Get jobs for a specific driver.

**Auth:** Required

**Response (200):**
```json
{
  "driver_id": "DRV-A1B2C3",
  "jobs": [ ... ]
}
```

---

### POST /api/driver/<driver_id>/complete/<job_id>/<stop_id>

Mark a stop as completed (admin completing on behalf of driver).

**Auth:** Required

**Response (200):**
```json
{
  "success": true,
  "stop": { ... },
  "job_status": "assigned"
}
```

---

## Error Format

All errors return a JSON object with an `error` field:

```json
{ "error": "Description of what went wrong" }
```

Common HTTP status codes:
- `400` — Bad request (missing or invalid data)
- `401` — Not authenticated or token expired
- `403` — Forbidden (blocked driver, insufficient role)
- `404` — Resource not found
- `409` — Conflict (duplicate email)
- `500` — Internal server error

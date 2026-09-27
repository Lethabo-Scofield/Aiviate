# Aiviate Dispatch — Feature Specifications

## Feature 1: Driver Mobile App (Mr Ngubane)

### Overview
A mobile-optimized web app for delivery drivers to receive jobs, view optimized routes on a map, and manage their delivery journey from start to finish.

### Current State
- Drivers can log in with credentials (email + password) created by an admin.
- The existing `MyJobs` page (`src/pages/MyJobs.jsx`) shows assigned jobs and lets drivers mark stops as completed.
- A `DriverLayout` component provides a simplified mobile-friendly layout.
- Backend endpoints exist: `GET /api/my-jobs`, `POST /api/my-jobs/<job_id>/complete/<stop_id>`.

### What Will Be Built

#### 1. Enhanced Driver Dashboard
- Summary cards: total active jobs, stops remaining today, completed deliveries.
- Pull-to-refresh style interaction for checking new job assignments.

#### 2. Job Detail View with Route Map
- Interactive Leaflet map showing all stops for a selected job as numbered markers.
- Optimized route polyline drawn on the map (using `route_geometry` from the job data).
- Each stop marker shows customer name, address, and completion status.

#### 3. Start Journey Flow
- "Start Journey" button on an assigned job.
- Step-by-step navigation view: shows the current stop with address, customer info, phone, and notes.
- "Mark Complete" action per stop, automatically advancing to the next stop.
- Progress indicator showing how many stops are done out of total.

#### 4. Mock Data Approach
- A static JSON file (`src/data/mockDriverData.json`) will provide realistic sample data.
- The mock data includes: jobs with stops (addresses, coordinates, customer info), route geometry, and driver profile info.
- The app will use this mock data directly, structured exactly like the API response format, so switching to live API calls later requires only changing the data source.

### Files to Create / Modify
| File | Action |
|------|--------|
| `src/data/mockDriverData.json` | **Create** — mock job/route data |
| `src/pages/DriverDashboard.jsx` | **Create** — enhanced driver home with stats |
| `src/pages/JobDetail.jsx` | **Create** — single job view with route map |
| `src/pages/ActiveJourney.jsx` | **Create** — step-by-step delivery navigation |
| `src/pages/MyJobs.jsx` | **Modify** — integrate with new dashboard |
| `src/components/DriverLayout.jsx` | **Modify** — add bottom navigation |
| `src/App.jsx` | **Modify** — add new driver routes |

---

## Feature 2: Email Notification System (Mr Mazibuko)

### Overview
An automated email system that sends notifications to users at key moments: account creation (with login credentials) and account blocking.

### Current State
- When an admin creates a driver, a `User` record is created with email, password hash, and a `Driver` record.
- If no password is provided, an 8-character random password is auto-generated.
- The generated password is stored in `driver.last_generated_password`.
- Blocking is done via `POST /api/drivers/<id>/block` which toggles the `blocked` flag.
- No email sending currently exists.

### What Will Be Built

#### 1. Email Service Module
- A backend module (`backend/services/email_service.py`) using Python's `smtplib` or a third-party email API.
- Configurable via environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`.
- HTML email templates with Aiviate branding.

#### 2. Welcome Email (On Driver Creation)
Triggered when a new driver account is created via `POST /api/drivers`.

**Email contents:**
- Subject: "Welcome to Aiviate — Your Driver Account"
- Company name
- Login email (username)
- Temporary app password
- Instructions to log in and start receiving deliveries
- Link to the driver app

#### 3. Account Blocked Email
Triggered when an admin blocks a driver via `POST /api/drivers/<id>/block`.

**Email contents:**
- Subject: "Aiviate Account Update — Access Suspended"
- Driver name
- Notification that their account has been suspended
- Instruction to contact their dispatcher for more information

#### 4. Account Unblocked Email
Triggered when an admin unblocks a previously blocked driver.

**Email contents:**
- Subject: "Aiviate Account Update — Access Restored"
- Driver name
- Notification that their account access has been restored
- Link to log back in

### Files to Create / Modify
| File | Action |
|------|--------|
| `backend/services/__init__.py` | **Create** — package init |
| `backend/services/email_service.py` | **Create** — email sending logic + templates |
| `backend/routes/drivers.py` | **Modify** — trigger emails on create/block |
| `backend/config.py` | **Modify** — add email config vars |

### Environment Variables Needed
| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | Email server hostname (e.g., `smtp.gmail.com`) |
| `SMTP_PORT` | Email server port (e.g., `587`) |
| `SMTP_USER` | Email account username |
| `SMTP_PASSWORD` | Email account password |
| `EMAIL_FROM` | Sender address (e.g., `noreply@aiviate.com`) |

---

## Dependencies Between Features
These two features are **independent** and can be developed in parallel:
- Feature 1 (Driver App) is purely frontend work with mock data.
- Feature 2 (Email System) is purely backend work.
- No code conflicts expected between them.

## Integration Notes
- Once Feature 1 is complete and the mock data is validated, the mock JSON import can be swapped for the existing API calls (`getMyJobs`, `completeMyStop`, etc.).
- Once Feature 2 is complete, the welcome email will include a link to the Driver App built in Feature 1.

# Aiviate Driver App

Expo / React Native app the assigned driver uses to execute delivery routes:
sign in, see today's assigned route, navigate stop-to-stop, and capture proof
of delivery — online or offline.

This app talks to the existing Aiviate operational API in `Website/backend`
(Flask). It does **not** run its own backend or database.

## What changed in the real-backend integration

The app previously ran entirely on in-memory seed data (`src/data/*` via a mock
`src/services/api.js`). It now authenticates against and reads/writes the real
API, while **reusing** the original client-side proof-of-delivery gate (barcode
match + geofence) that was already implemented and tested.

New/updated pieces:

| Concern | File |
|---|---|
| Runtime config (API URL, scheme, flags) | `src/config.js` |
| Token-aware HTTP client (auth header, 401 handling, typed errors, timeout) | `src/services/http.js` |
| Session token + profile storage | `src/services/session.js` |
| Backend endpoints + Job→route adapters | `src/services/backend.js`, `src/services/adapters.js` |
| Offline sync queue (idempotent, backoff, durable) | `src/services/syncQueue.js` |
| Auth state (restore, sign-in, activation, suspend, 401 sign-out) | `src/contexts/AuthContext.js` |
| Auth screens | `src/screens/{Login,Activate,ForgotPassword,Suspended}Screen.js` |
| Auth-gated navigation + activation deep link | `src/navigation/RootNavigator.js` |
| Real route data + offline stop completion | `src/contexts/JobsContext.js` |
| Driver identity from the signed-in user | `src/contexts/DriverContext.js` |
| Server location streaming while on a route | `src/hooks/useDriverLocation.js` |

The mock `src/services/api.js` is retained **as the reusable proof-gate module**
(`validateProof` / `ProofError`) and for the Earnings demo history; its unit
tests still pass.

## Local development

```bash
cd App
npm install
cp .env.example .env      # then set EXPO_PUBLIC_API_URL to your backend
npm run web               # or: npm run android / npm run ios
```

Run the backend it talks to (separate terminal):

```bash
cd Website
pip install -r backend/requirements.txt
python backend/app.py     # serves http://localhost:8000
```

### Environment variables

See `.env.example`. Only `EXPO_PUBLIC_*` vars reach the client bundle.

| Var | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Base URL of the operational API, incl. `/api` |
| `EXPO_PUBLIC_DEFAULT_DRIVER_EMAIL` | Optional login email prefill for internal/demo builds |
| `EXPO_PUBLIC_DEFAULT_DRIVER_PASSWORD` | Optional password prefill for local-only testing; do not set for production builds |
| `EXPO_PUBLIC_APP_SCHEME` | Deep-link scheme (must match `app.json` `expo.scheme`) |
| `EXPO_PUBLIC_FEATURE_SAFETY_DEVICE` | Gate the safety-device integration (default off) |
| `EXPO_PUBLIC_FEATURE_PUSH` | Gate push notifications (default off) |

For the current internal Sipho test flow, `eas.json` prefills:

```
EXPO_PUBLIC_DEFAULT_DRIVER_EMAIL=sipho@gmail.com
```

Do not commit or ship `EXPO_PUBLIC_DEFAULT_DRIVER_PASSWORD` in production. If
you need a private internal APK with the password prefilled, set it only in the
local shell or in the private EAS build environment for that one build.

## Backend endpoints used

All under `EXPO_PUBLIC_API_URL`:

- `POST /auth/login` → `{ token, user }` — implemented.
- `GET  /auth/me` → `{ user }` — implemented (session restore / validation).
- `POST /my-jobs` … `GET /my-jobs` → `{ driver, jobs }` — implemented; only the
  signed-in driver's jobs (server-enforced via the JWT), never UI-filtered.
- `POST /my-jobs/{jobId}/complete/{stopId}` — implemented; the app sends proof
  metadata + an `idempotency_key` in the body (forward-compatible; the current
  endpoint records completion and, when all stops are done, marks the job
  complete).
- `POST /drivers/{driverId}/location` — implemented; throttled position stream
  while a route is active.
- `GET  /alerts` — implemented (used opportunistically).

### Endpoints the app is wired to but the backend does not yet expose

These belong to the driver-onboarding / auth-hardening backend phase. The app
calls the documented contract and **degrades clearly** (shows a "not available
in this environment" message) when the endpoint returns 404/501:

- `POST /auth/activate` `{ token, password }` → `{ token, user }`
- `POST /auth/forgot-password` `{ email }` → 200 (must not reveal account existence)
- `POST /auth/reset-password` `{ token, password }`

## Activation deep link

The onboarding email link opens the app to the activation screen:

```
aviate://activate?token=<opaque-token>&email=<driver-email>
```

`app.json` declares `expo.scheme: "aviate"`, so the custom-scheme link resolves
to `ActivateScreen` (mapped in `RootNavigator`'s `linking` config) even before
sign-in. For **universal / app links** over `https://`, configure:

- iOS: `expo.ios.associatedDomains` (`applinks:<your-domain>`)
- Android: an `intentFilter` for the domain in `app.json`

and add the matching web fallback page (an "open in app / download the app"
page) at that domain so uninstalled devices land somewhere useful. The web
fallback prefix is listed in `RootNavigator`'s `linking.prefixes` — update it to
your domain.

### Android / iOS store links

Set your real store URLs in the onboarding email template (backend side). The
app itself needs no store link; the email's download links point at:

- Android: `https://play.google.com/store/apps/details?id=<expo.android.package>`
- iOS: your App Store listing URL

## Offline-first behaviour

- The active route is held in context; stop completions never require the
  network at capture time — the proof gate (barcode + geofence) runs locally.
- Each completion is enqueued in `syncQueue` with a **stable id**
  (`complete:<routeId>:<stopId>`) used both to dedupe locally and as the server
  idempotency key, so retries and double-taps cannot double-apply.
- The queue is durable (AsyncStorage), retries network/5xx failures with capped
  exponential backoff, flushes on reconnect (NetInfo), and survives app
  restarts.
- Terminal server rejections (e.g. the admin reassigned/cancelled the route,
  403 suspended) are surfaced as conflicts and **do not discard** the driver's
  captured proof — it's preserved on the failed op for recovery.

## Location & privacy

`useDriverLocation` requests foreground permission only while a route is active
(`enabled`), streams positions to `POST /drivers/{id}/location` throttled to
≤ every 15 s / 75 m to save battery, and stops when the route/shift ends. The
app remains usable if permission is denied, with the missing-location state
clearly flagged (the delivery proof gate still requires proximity).

## Tests

```bash
npm test
```

Covers the proof gate (existing), the Job→route adapters, the HTTP client
(auth header, error/401 normalisation, network errors), and the offline sync
queue (idempotent dedupe, backoff, terminal-failure evidence preservation,
restart durability).

## Known limitations / follow-ups

- Activation, forgot/reset-password depend on backend endpoints not yet
  deployed (see above); the UI is complete and contract-wired.
- Earnings history is still demo data — no backend earnings endpoint exists.
- In-app notifications currently use seed data; wiring to `GET /alerts` and a
  push provider is a follow-up (feature-flagged off by default).
- Profile lifetime stats (rating, totals) show neutral placeholders until a
  backend profile/stats endpoint exists.

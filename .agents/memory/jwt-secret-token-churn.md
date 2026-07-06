---
name: JWT_SECRET must be a persisted env var/secret
description: Why the backend must have JWT_SECRET set, and the 401-loop symptom when it isn't
---

# JWT_SECRET token churn

The Flask backend (`backend/config.py`) falls back to a random per-process secret
if `JWT_SECRET` is unset. When that happens, every backend restart re-signs tokens
with a new key, so any token a browser already holds becomes invalid → the app
shows a logged-in shell but every data call returns 401 (a "401 loop").

**Why:** `JWT_SECRET` was registered as a Replit *secret* but had no value
(`viewEnvVars` showed `{JWT_SECRET: false}`), so `os.environ.get("JWT_SECRET")`
returned empty and the random-secret fallback + warning fired on every boot.

**How to apply:** JWT_SECRET is an app-internal signing key, not an external
credential — generate a strong random and store it via `setEnvVars` in the
**shared** environment (covers dev + prod) so tokens survive restarts everywhere.
After setting it, restart the backend workflow and confirm the
"JWT_SECRET not set, using random secret" warning is gone. A stable secret is a
prerequisite for the offline-demo → real-backend session upgrade in
`src/contexts/AuthContext.jsx` to produce durable tokens.

---
name: Vercel deploy gotchas
description: Recurring pitfalls that break this project's Vercel builds (npm lockfile proxy URLs, serverless function size limit)
---

# Vercel deploy gotchas

## npm lockfile proxy URLs
Installing npm packages on Replit writes `http://package-firewall.replit.local/npm/...` as the `resolved` URL in `package-lock.json`. Vercel cannot resolve that host, so `npm install` fails at build time with ENOTFOUND.

**Why:** Replit routes npm through an internal package firewall proxy; the lockfile records that proxy URL.

**How to apply:** After any npm install on Replit, rewrite lockfile URLs before the user redeploys:
replace `http://package-firewall.replit.local/npm/` with `https://registry.npmjs.org/` in `package-lock.json` (integrity hashes stay valid — same tarballs).

## Serverless function size (250MB uncompressed)
`api/index.py` bundles everything in root `requirements.txt`. Mixing in AI Engine deps (ortools, pandas, numpy, fastapi, uvicorn, pillow) ballooned it to ~593MB and failed the build. The Flask backend only needs the slim set (flask, flask-cors, sqlalchemy, pg8000, bcrypt, PyJWT, geopy, openpyxl, requests, gunicorn) — `backend/optimize_route.py` is pure Python, no OR-Tools.

**How to apply:** Never add AI Engine / heavy deps to root `requirements.txt`; they belong to the separately-deployed engine.

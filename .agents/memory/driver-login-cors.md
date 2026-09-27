---
name: Driver login CORS diagnosis
description: Why a reachable original driver API can still fail only in the browser Preview.
---

When diagnosing a driver-app login failure, do not treat a successful curl to the original live API as proof that browser Preview can use it. An HTTP 401 or 200 can still be hidden behind a browser-level `Network request failed` when the live API omits the Access-Control-Allow-Origin header for the Expo Preview origin. Test browser and native paths separately; native requests do not enforce browser CORS.

**Why:** The imported app's original accounts live on the original live service, while its Replit development database has different accounts. Pointing everything at the Replit API made a disposable driver sign in successfully but could never validate a driver created on the original site. A direct call to the live API then failed CORS in browser Preview.

**How to apply:** If login appears network-broken again, first identify which account store and which runtime (web or native) the user uses. Verify the browser request URL and preflight; verify native connectivity separately. Never ask the user for their password to test.
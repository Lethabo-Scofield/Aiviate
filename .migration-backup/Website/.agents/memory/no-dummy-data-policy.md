---
name: No dummy data policy
description: User mandated removal of all fake/demo data; app must show only real backend data.
---

# No dummy data policy

Rule: Never add fabricated data anywhere — no offline demo fallbacks, no seeded fake records, no made-up KPI defaults (e.g. a fake "98% on-time" when there is no data).

**Why:** User explicitly asked (July 2026) to "remove dummy data across the app". The offline local-demo mode (fake stats/drivers/alerts in the frontend), the `/api/demo/seed` generator, and fabricated stat fallbacks were all removed.

**How to apply:**
- Empty states should show honest zeros/empty UI, not sample content.
- The demo login is allowed — it provisions a real, empty tenant only.
- Documentation-style examples (e.g. the CSV format example table in DispatchCenter) are fine; they are labeled examples, not data.
- Live-ops driver positions are still simulated server-side (gentle wobble) because there is no real GPS source yet — if real telemetry is added, replace it.

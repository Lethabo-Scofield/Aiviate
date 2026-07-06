---
name: Sidebar IA consolidation & agent dispatch intent
description: Why the nav is 5 lean tabs, how merged pages share children, and why the dispatch NLP pattern must stay narrow.
---

# Lean 5-tab information architecture

The dispatcher nav is intentionally **5 destinations**: Home · Map · Jobs · Fleet · Command Center.

- **Jobs** and **Fleet** are tab *containers* that render other pages as children via an
  `embedded` prop. A child page, when `embedded`, suppresses its own `<h1>` header (and
  switches its header row to `justify-end` so an action button like Add/Pair still shows).
  Tab state syncs through `useSearchParams` `?tab=`; children switch tabs by calling
  `navigate("/jobs?tab=...")` / `navigate("/fleet?tab=...")`.
- The old **AI Planner** page was removed. Planning is now a first-class agent capability
  on Home, not a page.

**Why:** the user explicitly chose "Lean (5 tabs)" over keeping 9 separate nav items.
**How to apply:** when adding a driver/device/safety/dispatch screen, add it as a tab inside
the existing container + `embedded` child — do NOT add a new top-level nav item. Keep legacy
URLs working via `<Navigate>` redirects in `App.jsx`.

# Agent "dispatch" intent

The engine dispatch (build routes from stops + auto-assign drivers) is reachable three ways:
the `/api/engine/dispatch` endpoint, the Jobs > "Upload & Optimize" tab, and the Home agent
via a `dispatch` intent. All share one helper `run_dispatch(db, company_id)` — keep it the
single source of truth; don't re-implement dispatch logic in the agent path.

**dispatch is STATE-CHANGING**, so its natural-language pattern must stay **narrow**: only
explicit `plan` / `dispatch` / `auto-assign` / `build routes` / `assign all|every` phrasing
may fire it. Generic verbs like `run` or `show` must NOT — otherwise read-only phrases such
as "run jobs report" would trigger a live dispatch. The dispatch patterns sit *above* the
"optimize all" patterns in `natural_parser.py` so "plan everything" dispatches rather than
re-optimizing; keep that ordering.

**Why:** a code review caught the original over-broad regex mapping "run jobs report" →
dispatch (an accidental write).
**How to apply:** when editing `natural_parser.py`, re-run the edge-phrase check
(plan my day / dispatch everything / run jobs report / assign j-1 to Mike / optimize all)
and confirm only the intended ones normalize to `dispatch`.

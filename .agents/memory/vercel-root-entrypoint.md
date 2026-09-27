---
name: Vercel workspace entrypoint
description: Why the pnpm workspace needs its own Vercel Flask entrypoint rather than the archived API wrappers.
---

Vercel deploys the current workspace root, not the archived original project. Because the root Python dependency manifest includes Flask, Vercel detects a Flask application and demands a valid root-importable entrypoint. Point it to a real Python module at the workspace root; don't accept the auto-suggested dotted module path through artifact directories with hyphens, and don't use the planner engine's private app.

**Why:** Deployment first hit the file-based function limit in the archived Vercel layout, then failed on a missing Flask entrypoint after the deploy target became the current workspace root. A change confined to the archived source cannot resolve root-level auto-detection.

**How to apply:** For Vercel deployment changes, identify the actual project root from build errors and keep the current workspace's single Flask entrypoint able to serve both the built web app and API. Keep the archived project's separate deployment layout separate from this one.
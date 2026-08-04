---
name: Command Center auto-approve
description: How the client-side auto-approve loop on the Command Center avoids spamming the audit log and handles failures.
---
Command Center recommendation IDs from `/intelligence/recommendations` are deterministic (`kind:subject_id`), so a standing risk keeps returning the same ID on every 20s poll.

**Why:** Acknowledging only hides a card client-side; it does not resolve the underlying condition, so the same rec reappears in the next fetch.

**How to apply:** Any auto-approve / auto-acknowledge loop must keep a session Set of already-processed IDs (kept even on success) so it does not re-approve and re-log the same standing recommendation on every poll. On API failure, roll back the optimistic dismiss and use a short cooldown (not permanent processed-marking) so it retries periodically instead of looping tightly or dropping the decision silently. Critical/high severity should be excludable so a human still approves them.

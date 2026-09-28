---
name: Gmail tenant boundary
description: Why in-app Gmail access uses tenant-bound OAuth rather than a workspace-wide agent connector
---

Use the application's per-company Gmail authorization for Dispatch chat searches and replies; do not silently substitute the Replit workspace Gmail connector when a company has not connected its inbox.

**Why:** Dispatch has separate company workspaces. A connector authorized once for the Replit workspace represents one mailbox across the application and could expose that mailbox to an unrelated company. It also cannot establish that a recipient company authorized a message to be sent from its account.

**How to apply:** Keep each chat read/send request tied to the authenticated company connection and its Google OAuth scopes. If live access is not configured, show a connection/setup limitation rather than returning synthetic mail or querying a shared connector.
---
name: GitHub push authentication
description: Distinction between a GitHub API integration and git push credentials in this workspace.
---

A GitHub connection authorized for the integration's REST API does not necessarily authenticate `git push` to an HTTPS GitHub remote in the workspace. If `git push` reports an invalid username or token, do not treat adding the already-authorized API integration as a Git credential repair.

**Why:** The integration was attached successfully, but a subsequent push still failed GitHub authentication. Replit documentation directs users to reconnect GitHub through the editor's Git pane for this error.

**How to apply:** Leave local commits intact, ask the user to reconnect GitHub in the Git pane without sharing a token, then retry the normal Git push. Avoid recreating the branch through REST Git Database calls, which would diverge local and remote history.
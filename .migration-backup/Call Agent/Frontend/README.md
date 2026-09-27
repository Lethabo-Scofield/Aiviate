# Deprecated Local Prototype

This folder is an old standalone "AI Support" mini-site prototype.

It is not part of the production Aiviate deployment.

Known issues:

- It uses hard-coded `localhost:3000` URLs.
- It reads old JSON-backed order routes.
- It duplicates customer tracking/support surfaces that should belong in WEB.

Replacement direction:

- Keep the Call Agent as a backend service in `Call Agent/Backend`.
- Put customer-facing browser voice support inside WEB.
- WEB should request browser call access through the Call Agent backend.

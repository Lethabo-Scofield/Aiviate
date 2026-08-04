# Aiviate Call Agent

The Call Agent is a backend service, not a standalone customer website.

Production role:

- Create approved Retell calls.
- Receive Retell webhooks.
- Expose Retell tool endpoints.
- Verify customers through the APP operational API.
- Request reschedules, availability confirmations and human handoffs through the APP operational API.

The Call Agent must not own order data and must not read APP databases directly.

## Deployable Service

Deploy:

```text
Call Agent/Backend
```

Run locally:

```bash
cd "Call Agent/Backend"
npm ci
npm start
```

Required environment:

```text
AIVIATE_API_URL=
AIVIATE_SERVICE_TOKEN=
CALL_AGENT_SIMULATION_MODE=true
RETELL_API_KEY=
RETELL_AGENT_ID=
RETELL_FROM_NUMBER=
RETELL_WEBHOOK_SECRET=
```

Keep `CALL_AGENT_SIMULATION_MODE=true` until Retell credentials and approved call policies are verified.

## Frontend Folder

`Call Agent/Frontend` is an old local prototype for an "AI Support" mini-site. It is not a production deployment target.

Customer-facing browser voice support should live inside WEB/customer pages and call the Call Agent backend, for example through `POST /api/create-web-call`.

Do not deploy `Call Agent/Frontend` as a standalone Aiviate surface.

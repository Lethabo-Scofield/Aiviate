# Chat email assistant (Gmail)

The dispatch chat can find emails in the company's connected Gmail, summarise them, and
**draft replies for a person to approve**. Nothing is emailed until someone presses
**Approve & send** on that exact draft.

## What you can ask

- "Check my emails for order AIV-1042 and tell me whether the supplier confirmed."
- "Reply to all of my emails from suppliers about delayed pallets."
- "Show me the latest unread emails." (summary only, no drafts)

Drafts are only written when the request asks for a reply/response/draft.

## How it is kept safe

| Risk | Control |
| --- | --- |
| AI sends something by itself | The AI only writes reply *text*. Sending is a separate API call (`POST /api/integrations/gmail/drafts/<id>/approve`) naming the draft **revision** the person saw. |
| AI or an email redirects a reply | Recipient, subject and thread are taken by the server from the original email's headers. They cannot be set by the model or the client. The recipient is re-checked at send time. |
| Prompt injection in an email | Email text is passed to the model as untrusted data; model output is validated (must refer to an email that was shown, at most 3 drafts, no replies to no-reply/own-mailbox senders, bounded length). Even a fully fooled model can only produce text a person reads first. |
| Double send / races | Approval atomically claims the draft (`pending -> sending`). Edits bump the revision, so approving a stale view fails. An unconfirmed send becomes `unknown` and is never retried automatically. |
| Runaway sending | Hourly per-company cap (`EMAIL_SENDS_PER_HOUR`, default 30); drafts expire (`EMAIL_DRAFT_TTL_HOURS`, default 48). |
| Cross-company access | Every draft query is scoped by `company_id`. |
| Stolen database | OAuth tokens are encrypted (Fernet, key derived from `AIVIATE_INTEGRATION_SECRET`, falling back to `JWT_SECRET`). Old XOR-obfuscated tokens still work and are upgraded on first use. In production, tokens are not stored without a real secret. |
| Test URLs in production | `GMAIL_API_BASE`, `GOOGLE_TOKEN_URL`, `OPENAI_API_BASE`, `GEMINI_API_BASE` are ignored when `APP_ENV`/`VERCEL_ENV` is `production`. |

Audit rows record who drafted/approved/sent and the Gmail message id, never the body text.

## Setup checklist

1. **Server env vars** (Vercel project settings, never in git):
   - `JWT_SECRET` (already required) and ideally a separate `AIVIATE_INTEGRATION_SECRET` (32+ random chars).
     **Do not change it after tokens are stored** or users must reconnect Gmail.
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
     (must match the authorised redirect URI in Google Cloud exactly).
   - An AI key: `OPENAI_API_KEY` or `GOOGLE_API_KEY`/`GEMINI_API_KEY`. Without one the chat still
     finds emails, but gives no summary or drafts.
2. **Google Cloud**: enable the Gmail API; OAuth consent screen with scopes `gmail.readonly` and
   `gmail.send`; add the redirect URI above to the OAuth client.
3. **Database**: new table `email_drafts`. Vercel runs with `SKIP_DB_INIT=true`, so create it once
   against the production database (it is created automatically on SQLite/local).
4. **Reconnect Gmail** from Integrations so the connection holds the `gmail.send` scope and an
   encrypted token. A read-only connection can search but not draft.

## Known limits

- `gmail.readonly`/`gmail.send` are *sensitive* scopes. While the consent screen is in **Testing**
  status, Google expires refresh tokens after 7 days; publish/verify the app for production use.
- Tested against a faithful fake of Gmail/Google and of the LLM over real HTTP, on SQLite. It has
  **not** been run against real Google, a real LLM key or Postgres in this repo's CI.
- Only the first 8 matching emails are read per request; replies are plain text (no attachments).

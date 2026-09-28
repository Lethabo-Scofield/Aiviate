import base64
import re
import json
import os
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import getaddresses
from urllib.parse import urlencode, urlunparse

import requests


GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"


class GmailReauthorizationRequired(Exception):
    """Raised when Google no longer accepts the stored Gmail authorization."""


def gmail_api_error_summary(error):
    """Turn a Google API error response into actionable, non-secret guidance."""
    response = getattr(error, "response", None)
    payload = {}
    if response is not None:
        try:
            payload = response.json() or {}
        except (ValueError, TypeError):
            payload = {}

    error_data = payload.get("error", {})
    details = error_data.get("errors", []) if isinstance(error_data, dict) else []
    reason = details[0].get("reason") if details and isinstance(details[0], dict) else None
    message = error_data.get("message") if isinstance(error_data, dict) else None

    if reason == "accessNotConfigured":
        return "The Gmail API is disabled for the Google Cloud project used by this OAuth client. Enable Gmail API in that project, then retry."
    if reason == "insufficientPermissions":
        return (
            "Google did not grant the required Gmail permission. Disconnect Gmail, "
            "then reconnect and approve both gmail.readonly and gmail.send."
        )
    if reason == "domainPolicy":
        return "Your Google Workspace administrator's policy blocks this Gmail API access. Ask the administrator to allow the app."
    if reason:
        suffix = f": {message}" if message else ""
        return f"Google rejected the Gmail API request ({reason}){suffix}"
    if message:
        return f"Google rejected the Gmail API request: {message}"
    return (
        "Google denied Gmail API access. Check that Gmail API is enabled and "
        "gmail.readonly and gmail.send permissions were granted."
    )


def build_google_oauth_url(company_id, redirect_uri, client_id=None, state=None):
    """Create the Google OAuth consent URL for a workspace-scoped Gmail connector."""
    client_id = client_id or os.environ.get("GOOGLE_CLIENT_ID", "")
    if not client_id:
        raise ValueError("GOOGLE_CLIENT_ID is not configured")
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join([
            GMAIL_READ_SCOPE,
            GMAIL_SEND_SCOPE,
            "openid",
            "email",
            "profile",
        ]),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state or f"workspace:{company_id}",
    }
    return urlunparse(("https", "accounts.google.com", "/o/oauth2/v2/auth", "", urlencode(params), ""))


def build_search_query(order_ref=None, supplier_name=None, customer_name=None, limit=10):
    """Build a Gmail search string for order-status or supplier confirmation queries."""
    terms = ["in:inbox", "label:inbox", "-label:trash"]
    if order_ref:
        terms.append(f'"{order_ref}"')
    if supplier_name:
        terms.append(f'"{supplier_name}"')
    if customer_name:
        terms.append(f'"{customer_name}"')
    return " ".join(terms)


def _decode_data(data):
    if not data:
        return ""
    padding = "=" * (-len(data) % 4)
    try:
        raw = base64.urlsafe_b64decode((data + padding).encode("ascii"))
        return raw.decode("utf-8", errors="replace")
    except Exception:
        return ""


def extract_message_summary(message):
    """Normalize a Gmail API message record to a compact, agent-friendly shape."""
    headers = message.get("payload", {}).get("headers", []) or []
    header_map = {h.get("name", "").lower(): h.get("value", "") for h in headers}
    snippet = (message.get("snippet") or "").strip()
    body = message.get("payload", {}).get("body", {}) or {}
    body_data = body.get("data") or ""
    body_preview = _decode_data(body_data)
    if not body_preview and snippet:
        body_preview = snippet
    return {
        "id": message.get("id"),
        "thread_id": message.get("threadId"),
        "subject": header_map.get("subject") or "(no subject)",
        "from": header_map.get("from") or "Unknown sender",
        "reply_to": resolve_reply_recipient(headers),
        "date": header_map.get("date") or "",
        "snippet": snippet,
        "body_preview": body_preview[:2000],
    }


def get_message_details(access_token, message_id):
    """Fetch a single Gmail message by ID using a workspace-scoped access token."""
    url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    res = requests.get(url, headers=headers, timeout=20)
    res.raise_for_status()
    return res.json()


def _refresh_gmail_access_token(refresh_token):
    if not refresh_token:
        raise GmailReauthorizationRequired(
            "Google did not provide a refresh token. Disconnect and reconnect Gmail to restore access."
        )

    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise GmailReauthorizationRequired(
            "Google OAuth credentials are missing on the backend. Configure them before reconnecting Gmail."
        )

    response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    token_data = response.json() if response.content else {}
    if response.status_code >= 400 or not token_data.get("access_token"):
        error = token_data.get("error")
        if error in {"invalid_grant", "unauthorized_client"}:
            raise GmailReauthorizationRequired(
                "Google authorization expired or was revoked. Disconnect and reconnect Gmail."
            )
        raise GmailReauthorizationRequired(
            "Google could not refresh Gmail access. Disconnect and reconnect Gmail."
        )
    return token_data["access_token"]


def _single_header(headers, name):
    values = [
        str(header.get("value", ""))
        for header in headers
        if str(header.get("name", "")).lower() == name.lower()
    ]
    if len(values) > 1:
        raise ValueError(f"Source message has multiple {name} headers")
    value = values[0] if values else ""
    if any(ord(char) < 32 and char != "\t" for char in value) or "\r" in value or "\n" in value:
        raise ValueError(f"Source message has an invalid {name} header")
    return value.strip()


def _parse_single_email(value):
    parsed = getaddresses([value])
    valid = [
        address.strip()
        for _, address in parsed
        if address and re.fullmatch(
            r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?",
            address.strip(),
        )
    ]
    return valid[0] if len(parsed) == 1 and len(valid) == 1 else None


def resolve_reply_recipient(headers):
    """Resolve Reply-To when valid, otherwise fall back to a valid From address."""
    for name in ("Reply-To", "From"):
        try:
            value = _single_header(headers, name)
        except ValueError:
            continue
        if value:
            address = _parse_single_email(value)
            if address:
                return address
    return None


def _reply_recipient(headers):
    recipient = resolve_reply_recipient(headers)
    if not recipient:
        raise ValueError("Source message does not have one valid reply recipient")
    return recipient


def build_gmail_reply(source_message, body, sender_email):
    """Build a safe plain-text RFC 2822 reply using only source-message headers."""
    headers = source_message.get("payload", {}).get("headers", []) or []
    recipient = _reply_recipient(headers)
    normalized_sender = (sender_email or "").strip()
    if not re.fullmatch(
        r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?",
        normalized_sender,
    ):
        raise ValueError("The connected Gmail account has no valid email address")
    if recipient.casefold() == normalized_sender.casefold():
        raise ValueError("Cannot reply to the connected Gmail account itself")

    subject = _single_header(headers, "Subject") or "(no subject)"
    if len(subject) > 998:
        raise ValueError("Source message subject is too long")
    reply_subject = subject if re.match(r"^\s*re\s*:", subject, flags=re.IGNORECASE) else f"Re: {subject}"

    source_message_id = _single_header(headers, "Message-ID")
    references = _single_header(headers, "References")
    if source_message_id and (not source_message_id.startswith("<") or not source_message_id.endswith(">")):
        raise ValueError("Source message has an invalid Message-ID header")

    email_message = EmailMessage(policy=SMTP)
    email_message["To"] = recipient
    email_message["Subject"] = reply_subject
    if source_message_id:
        email_message["In-Reply-To"] = source_message_id
        reference_values = f"{references} {source_message_id}".strip()
        email_message["References"] = reference_values
    email_message.set_content(body.replace("\r\n", "\n").replace("\r", "\n"))

    raw = base64.urlsafe_b64encode(email_message.as_bytes()).decode("ascii").rstrip("=")
    return {
        "recipient": recipient,
        "subject": reply_subject,
        "raw": raw,
        "thread_id": source_message.get("threadId"),
    }


def send_gmail_reply_with_refresh(access_token, refresh_token, message_id, body, sender_email):
    """Fetch the source and send a threaded reply, refreshing an expired token once."""
    token = access_token
    for attempt in range(2):
        try:
            source = get_message_details(token, message_id)
            reply = build_gmail_reply(source, body, sender_email)
            request_body = {"raw": reply["raw"]}
            if reply["thread_id"]:
                request_body["threadId"] = reply["thread_id"]
            response = requests.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={"Authorization": f"Bearer {token}"},
                json=request_body,
                timeout=30,
            )
            response.raise_for_status()
            sent = response.json() or {}
            return {
                "id": sent.get("id"),
                "thread_id": sent.get("threadId") or reply["thread_id"],
                "recipient": reply["recipient"],
                "subject": reply["subject"],
            }, token
        except requests.HTTPError as exc:
            if exc.response is None or exc.response.status_code != 401:
                raise
            if attempt:
                raise GmailReauthorizationRequired(
                    "Google rejected the refreshed Gmail authorization. Disconnect and reconnect Gmail."
                ) from exc
            token = _refresh_gmail_access_token(refresh_token)
    raise GmailReauthorizationRequired("Google Gmail authorization could not be refreshed.")


def fetch_gmail_messages(access_token, query, max_results=10):
    """Search Gmail and return a compact summary list of matching messages."""
    if not access_token:
        raise ValueError("access_token is required")
    url = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    headers = {"Authorization": f"Bearer {access_token}"}
    params = {"q": query, "maxResults": int(max_results)}
    res = requests.get(url, headers=headers, params=params, timeout=20)
    res.raise_for_status()
    payload = res.json() or {}
    message_ids = [item.get("id") for item in payload.get("messages", []) if item.get("id")]
    details = []
    for message_id in message_ids:
        try:
            message = get_message_details(access_token, message_id)
            details.append(extract_message_summary(message))
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code in {401, 403}:
                raise
            continue
        except Exception:
            continue
    return details


def fetch_gmail_messages_with_refresh(access_token, refresh_token, query, max_results=10):
    """Retry one expired Gmail access token using its OAuth refresh token."""
    try:
        return fetch_gmail_messages(access_token, query, max_results), access_token
    except requests.HTTPError as exc:
        if exc.response is None or exc.response.status_code != 401:
            raise

    refreshed_token = _refresh_gmail_access_token(refresh_token)
    try:
        messages = fetch_gmail_messages(refreshed_token, query, max_results)
    except requests.HTTPError as exc:
        if exc.response is not None and exc.response.status_code == 401:
            raise GmailReauthorizationRequired(
                "Google rejected the refreshed Gmail authorization. Disconnect and reconnect Gmail."
            ) from exc
        raise
    return messages, refreshed_token


def summarize_confirmation_messages(messages, order_ref=None, supplier_name=None):
    """Return a compact confirmation result for order-status Gmail checks."""
    if not messages:
        return None
    normalized = []
    for message in messages:
        text = "\n".join(
            [
                message.get("subject") or "",
                message.get("from") or "",
                message.get("snippet") or "",
                message.get("body_preview") or "",
            ]
        ).lower()
        is_confirming = any(
            phrase in text
            for phrase in [
                "confirmed",
                "order confirmed",
                "we have confirmed",
                "scheduled",
                "dispatch",
                "shipment",
                "eta",
                "on the way",
                "will ship",
                "approval",
            ]
        )
        if not is_confirming:
            continue
        if order_ref and order_ref.lower() not in (message.get("subject") or "" + " " + (message.get("snippet") or "") + " " + (message.get("body_preview") or "")).lower():
            continue
        normalized.append(message)
    if not normalized:
        return None
    best = normalized[0]
    subject = best.get("subject") or "Supplier email"
    sender = best.get("from") or "supplier"
    body = best.get("body_preview") or best.get("snippet") or ""
    summary = (
        f"Yes — the supplier appears to have confirmed order {order_ref or 'the order'}. "
        f"The strongest email is from {sender} with subject '{subject}'. "
        f"Evidence: {body[:400]}"
    )
    return {
        "ok": True,
        "matched": True,
        "summary": summary,
        "message": best,
    }

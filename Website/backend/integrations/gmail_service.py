import base64
import json
import os
from urllib.parse import parse_qs, urlencode, urlunparse

import requests


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
            "https://www.googleapis.com/auth/gmail.readonly",
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
    if limit:
        terms.append(f"is:unread")
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
        except Exception:
            continue
    return details


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

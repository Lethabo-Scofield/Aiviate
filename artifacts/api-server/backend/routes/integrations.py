import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import traceback
import uuid
from datetime import datetime, timezone

import requests
from flask import g, jsonify, request

from config import JWT_SECRET
from intelligence.audit_logger import log_action
from integrations import drafts as drafts_service
from intelligence import email_agent
from integrations.connection import active_gmail_connection, load_tokens, save_access_token
from integrations.gmail_service import (
    GmailReauthorizationRequired,
    build_google_oauth_url,
    build_search_query,
    fetch_gmail_messages_with_refresh,
    gmail_api_error_summary,
    google_token_url,
)
from integrations.demo_catalog import DEMO_INTEGRATIONS
from middleware import require_admin, require_auth
from models import IntegrationConnection, protect_integration_token, reveal_integration_token
from routes import integrations_bp
from utils import get_db_session


def _current_workspace(client_company_id=None):
    if client_company_id:
        return client_company_id
    return getattr(g, "company_id", None)


def _normalize_redirect_uri(value):
    if not value:
        return ""
    return value.strip().rstrip("/")


def _resolve_google_redirect_uri(requested_redirect_uri=None):
    configured = _normalize_redirect_uri(os.environ.get("GOOGLE_REDIRECT_URI"))
    requested = _normalize_redirect_uri(requested_redirect_uri)

    if configured and requested and requested != configured:
        raise ValueError(
            "Google redirect URI mismatch. "
            "Set frontend and backend to use GOOGLE_REDIRECT_URI exactly. "
            f"Expected: {configured}"
        )

    redirect_uri = configured or requested
    if not redirect_uri:
        raise ValueError("Google redirect URI is not configured")
    return redirect_uri


def _issue_gmail_oauth_state(company_id):
    # HMAC binds a short-lived state to its workspace. It is not persisted for
    # one-time use; the authenticated callback company binding and Google's
    # single-use authorization code provide the additional checks.
    payload = {
        "company_id": str(company_id),
        "expires_at": int(datetime.now(timezone.utc).timestamp()) + 600,
        "nonce": secrets.token_urlsafe(24),
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded}.{base64.urlsafe_b64encode(signature).decode('ascii').rstrip('=')}"


def _validate_gmail_oauth_state(state, authenticated_company_id):
    if not isinstance(state, str) or state.count(".") != 1:
        return False
    encoded, provided_signature = state.split(".", 1)
    expected_signature = hmac.new(
        JWT_SECRET.encode("utf-8"), encoded.encode("ascii", errors="ignore"), hashlib.sha256
    ).digest()
    expected = base64.urlsafe_b64encode(expected_signature).decode("ascii").rstrip("=")
    if not hmac.compare_digest(provided_signature, expected):
        return False
    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        return (
            payload.get("company_id") == str(authenticated_company_id)
            and int(payload.get("expires_at", 0)) >= int(datetime.now(timezone.utc).timestamp())
            and bool(payload.get("nonce"))
        )
    except (ValueError, TypeError, json.JSONDecodeError):
        return False


@integrations_bp.route("/api/integrations", methods=["GET"])
@require_auth
@require_admin
def list_integrations():
    db = get_db_session()
    try:
        company_id = _current_workspace()
        rows = (
            db.query(IntegrationConnection)
            .filter(
                IntegrationConnection.company_id == company_id,
                IntegrationConnection.provider == "gmail",
                IntegrationConnection.is_active.is_(True),
            )
            .order_by(IntegrationConnection.connected_at.desc())
            .all()
        )
        return jsonify({"connections": [r.to_dict() for r in rows], "demos": DEMO_INTEGRATIONS})
    finally:
        db.close()


@integrations_bp.route("/api/integrations/gmail/auth-url", methods=["POST"])
@require_auth
@require_admin
def gmail_auth_url():
    payload = request.get_json(silent=True) or {}
    company_id = _current_workspace()
    state = _issue_gmail_oauth_state(company_id)
    try:
        redirect_uri = _resolve_google_redirect_uri(payload.get("redirect_uri"))
        url = build_google_oauth_url(company_id, redirect_uri, state=state)
        return jsonify({"url": url, "state": state, "redirect_uri": redirect_uri})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@integrations_bp.route("/api/integrations/gmail/callback", methods=["POST"])
@require_auth
@require_admin
def gmail_callback():
    body = request.get_json(silent=True) or {}
    code = body.get("code")
    state = body.get("state")
    if not code:
        return jsonify({"error": "code is required"}), 400
    company_id = _current_workspace()
    if not _validate_gmail_oauth_state(state, company_id):
        return jsonify({"error": "Invalid or expired Gmail OAuth state; start the connection flow again"}), 400

    try:
        redirect_uri = _resolve_google_redirect_uri(body.get("redirect_uri"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        return jsonify({"error": "Google OAuth is not configured on this backend"}), 400

    token_res = requests.post(
        google_token_url(),
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    if token_res.status_code >= 400:
        return jsonify({"error": "Google did not accept the sign-in. Start the connection again."}), 400

    token_data = token_res.json() or {}
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    gmail_user = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    gmail_user.raise_for_status()
    user_info = gmail_user.json() or {}

    db = get_db_session()
    try:
        existing = (
            db.query(IntegrationConnection)
            .filter(
                IntegrationConnection.company_id == company_id,
                IntegrationConnection.provider == "gmail",
                IntegrationConnection.is_active.is_(True),
            )
            .first()
        )
        if existing:
            existing.display_name = user_info.get("name") or existing.display_name
            existing.provider_user_email = user_info.get("email")
            existing.access_token = protect_integration_token(access_token)
            existing.refresh_token = protect_integration_token(refresh_token) if refresh_token else existing.refresh_token
            existing.connection_metadata = {"gmail_user_id": user_info.get("id")}
            existing.scopes = token_data.get("scope", "").split(" ") if token_data.get("scope") else []
            existing.updated_at = datetime.now(timezone.utc)
            conn = existing
        else:
            conn = IntegrationConnection(
                id=f"INT-{uuid.uuid4().hex[:12].upper()}",
                company_id=company_id,
                provider="gmail",
                provider_user_email=user_info.get("email"),
                display_name=user_info.get("name") or "Gmail",
                access_token=protect_integration_token(access_token),
                refresh_token=protect_integration_token(refresh_token) if refresh_token else None,
                scopes=(token_data.get("scope", "").split(" ") if token_data.get("scope") else []),
                connection_metadata={"gmail_user_id": user_info.get("id")},
            )
            db.add(conn)
        db.commit()
        log_action(
            db,
            company_id=company_id,
            action_type="integration_connected",
            summary=f"Connected Gmail for workspace {company_id}",
            actor=getattr(g, "user_email", "admin"),
            confidence=1.0,
            requires_approval=False,
            related_id=conn.id,
            details={"provider": "gmail", "user_email": user_info.get("email")},
        )
        return jsonify({"success": True, "connection": conn.to_dict()})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to save Gmail connection"}), 500
    finally:
        db.close()


@integrations_bp.route("/api/integrations/gmail/search", methods=["POST"])
@require_auth
@require_admin
def gmail_search():
    body = request.get_json(silent=True) or {}
    company_id = _current_workspace()
    query = body.get("query") or build_search_query(
        order_ref=body.get("order_ref"),
        supplier_name=body.get("supplier_name"),
        customer_name=body.get("customer_name"),
    )
    db = get_db_session()
    try:
        conn = active_gmail_connection(db, company_id)
        if not conn:
            return jsonify({"error": "No Gmail connection is active for this workspace"}), 404
        token, refresh_token = load_tokens(db, conn)
        try:
            limit = max(1, min(int(body.get("max_results", 10)), 25))
        except (TypeError, ValueError):
            limit = 10
        messages, refreshed_token = fetch_gmail_messages_with_refresh(token, refresh_token, query, max_results=limit)
        if refreshed_token != token:
            save_access_token(db, conn, refreshed_token)
        log_action(
            db,
            company_id=company_id,
            action_type="integration_email_search",
            summary=f"Searched Gmail for: {query[:120]}",
            actor=getattr(g, "user_email", "admin"),
            confidence=1.0,
            requires_approval=False,
            related_id=conn.id,
            details={"query": query},
        )
        return jsonify({"results": messages, "query": query})
    except GmailReauthorizationRequired as exc:
        db.rollback()
        return jsonify({"error": str(exc)}), 401
    except requests.HTTPError as exc:
        db.rollback()
        traceback.print_exc()
        if exc.response is not None and exc.response.status_code == 403:
            return jsonify({"error": gmail_api_error_summary(exc)}), 403
        return jsonify({"error": "Gmail could not be reached right now. Please try again shortly."}), 502
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to access Gmail"}), 500
    finally:
        db.close()


def _draft_response(db, action):
    """Run a draft action and turn every failure into a clear, non-leaky JSON error."""
    try:
        return action()
    except drafts_service.DraftError as exc:
        db.rollback()
        return jsonify({"error": str(exc)}), exc.status
    except GmailReauthorizationRequired as exc:
        db.rollback()
        return jsonify({"error": str(exc)}), 401
    except requests.HTTPError as exc:
        db.rollback()
        traceback.print_exc()
        code = exc.response.status_code if exc.response is not None else 0
        if code == 403:
            return jsonify({"error": gmail_api_error_summary(exc)}), 403
        if code == 404:
            return jsonify({"error": "The original Gmail message could not be found."}), 404
        return jsonify({"error": "Gmail could not be reached right now. Please try again shortly."}), 502
    except requests.RequestException:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Gmail could not be reached right now. Please try again shortly."}), 502
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Something went wrong with that draft."}), 500


def _revision_from(payload):
    try:
        return int(payload.get("revision"))
    except (TypeError, ValueError):
        raise drafts_service.DraftInvalid("revision is required: send the revision you reviewed.")


def _json_object():
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def _actor():
    return getattr(g, "user_email", None) or getattr(g, "user_id", None) or "admin"


@integrations_bp.route("/api/integrations/gmail/assistant", methods=["POST"])
@require_auth
@require_admin
def gmail_assistant():
    """The chat's email skill: find emails, summarise them, and (when asked) draft replies.

    Always safe to call: it never sends. It returns an AI result with drafts waiting for
    approval, or, when no AI key is configured, a plain searchable result.
    """
    text = str(_json_object().get("text") or "").strip()[:1000]
    if not text:
        return jsonify({"error": "Tell me what to look for or reply to."}), 400
    db = get_db_session()
    try:
        return jsonify(email_agent.run(db, _current_workspace(), _actor(), text))
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"ok": False, "summary": "I couldn't read your email just now. Please try again shortly."}), 500
    finally:
        db.close()


@integrations_bp.route("/api/integrations/gmail/drafts", methods=["POST"])
@require_auth
@require_admin
def gmail_create_draft():
    """Write a reply to a draft. Nothing is emailed; the recipient comes from the original message."""
    payload = _json_object()
    db = get_db_session()
    try:
        def action():
            draft = drafts_service.create_draft(
                db, company_id=_current_workspace(), message_id=payload.get("message_id"),
                body=payload.get("body"), author="user", created_by=_actor(),
            )
            return jsonify({"draft": draft.to_dict()}), 201
        return _draft_response(db, action)
    finally:
        db.close()


@integrations_bp.route("/api/integrations/gmail/drafts", methods=["GET"])
@require_auth
@require_admin
def gmail_list_drafts():
    status = request.args.get("status", drafts_service.PENDING)
    db = get_db_session()
    try:
        def action():
            drafts = drafts_service.list_drafts(db, _current_workspace(), status=status or None)
            return jsonify({"drafts": [d.to_dict() for d in drafts]})
        return _draft_response(db, action)
    finally:
        db.close()


@integrations_bp.route("/api/integrations/gmail/drafts/<draft_id>", methods=["PATCH"])
@require_auth
@require_admin
def gmail_edit_draft(draft_id):
    payload = _json_object()
    db = get_db_session()
    try:
        def action():
            draft = drafts_service.update_body(
                db, company_id=_current_workspace(), draft_id=draft_id, body=payload.get("body"),
                revision=_revision_from(payload), editor=_actor(),
            )
            return jsonify({"draft": draft.to_dict()})
        return _draft_response(db, action)
    finally:
        db.close()


@integrations_bp.route("/api/integrations/gmail/drafts/<draft_id>/approve", methods=["POST"])
@require_auth
@require_admin
def gmail_approve_draft(draft_id):
    """The permission step: send this exact revision of this draft, once."""
    payload = _json_object()
    db = get_db_session()
    try:
        def action():
            draft = drafts_service.approve_and_send(
                db, company_id=_current_workspace(), draft_id=draft_id,
                revision=_revision_from(payload), approver=_actor(),
            )
            return jsonify({
                "ok": True, "draft": draft.to_dict(), "id": draft.sent_message_id,
                "recipient": draft.recipient, "subject": draft.subject,
            })
        return _draft_response(db, action)
    finally:
        db.close()


@integrations_bp.route("/api/integrations/gmail/drafts/<draft_id>/discard", methods=["POST"])
@require_auth
@require_admin
def gmail_discard_draft(draft_id):
    db = get_db_session()
    try:
        def action():
            draft = drafts_service.discard(db, company_id=_current_workspace(), draft_id=draft_id, actor=_actor())
            return jsonify({"draft": draft.to_dict()})
        return _draft_response(db, action)
    finally:
        db.close()


@integrations_bp.route("/api/integrations/<provider>/disconnect", methods=["POST"])
@require_auth
@require_admin
def disconnect_integration(provider):
    company_id = _current_workspace()
    db = get_db_session()
    try:
        conn = (
            db.query(IntegrationConnection)
            .filter(
                IntegrationConnection.company_id == company_id,
                IntegrationConnection.provider == provider.lower(),
                IntegrationConnection.is_active.is_(True),
            )
            .first()
        )
        if not conn:
            return jsonify({"success": True})

        if provider.lower() == "gmail":
            try:
                token = reveal_integration_token(conn.access_token) if conn.access_token else ""
                if token:
                    requests.post(
                        "https://oauth2.googleapis.com/revoke",
                        data={"token": token},
                        headers={"Content-Type": "application/x-www-form-urlencoded"},
                        timeout=15,
                    )
            except Exception:
                traceback.print_exc()

            conn.access_token = None
            conn.refresh_token = None

        conn.is_active = False
        conn.updated_at = datetime.now(timezone.utc)
        db.commit()
        return jsonify({"success": True, "provider": provider})
    finally:
        db.close()

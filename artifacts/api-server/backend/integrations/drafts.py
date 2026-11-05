"""Email reply drafts: the only way an email gets sent from Aiviate.

A reply is always written to a *draft* first, whoever wrote it. The server fixes the
recipient, subject and thread from the original message's headers when the draft is
created, so neither a person's request nor the AI's output can choose where it goes. Only the
text can change, and each change bumps `revision`.

Sending is a separate step that must name the revision the approver saw. It is claimed
with one conditional UPDATE...RETURNING (so two clicks, or two tabs, send once), and the
recipient is re-checked against the original message at the moment of sending.

Everything here is scoped to one company: a draft is looked up by id *and* company.
"""
import os
import re
import uuid
from datetime import timedelta

import requests
from sqlalchemy import update

from intelligence.audit_logger import log_action
from models import EmailDraft, naive_utcnow

from .connection import active_gmail_connection, can_send, load_tokens, save_access_token
from .gmail_service import (
    GmailReauthorizationRequired,
    build_gmail_reply,
    extract_message_summary,
    get_message_with_refresh,
    send_gmail_reply_with_refresh,
)

PENDING, SENDING, SENT, DISCARDED, EXPIRED, FAILED, UNKNOWN = (
    "pending", "sending", "sent", "discarded", "expired", "failed", "unknown",
)

MESSAGE_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,256}")
MAX_BODY_CHARS = 10000
MAX_PENDING = 50


class DraftError(Exception):
    status = 400


class DraftInvalid(DraftError):
    status = 400


class DraftForbidden(DraftError):
    status = 403


class DraftNotFound(DraftError):
    status = 404


class DraftConflict(DraftError):
    status = 409


class DraftRateLimited(DraftError):
    status = 429


class DraftUncertain(DraftError):
    """Google may or may not have sent it. The person must check Sent before trying again."""
    status = 502


def _env_int(name, default, minimum=1):
    try:
        return max(int(os.environ.get(name, default)), minimum)
    except (TypeError, ValueError):
        return default


def draft_ttl_hours():
    return _env_int("EMAIL_DRAFT_TTL_HOURS", 48)


def sends_per_hour():
    return _env_int("EMAIL_SENDS_PER_HOUR", 30)


def clean_body(value):
    """Plain text only, normalised, non-empty and bounded. Raises DraftInvalid."""
    if not isinstance(value, str):
        raise DraftInvalid("The reply text is required.")
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    if any(ord(c) < 32 and c not in "\t\n" for c in text):
        raise DraftInvalid("The reply can only contain plain text.")
    text = text.strip()
    if not text:
        raise DraftInvalid("The reply text can't be empty.")
    if len(text) > MAX_BODY_CHARS:
        raise DraftInvalid(f"The reply is too long (limit {MAX_BODY_CHARS} characters).")
    return text


def _audit(db, company_id, action_type, summary, actor, draft, **details):
    try:
        log_action(
            db, company_id=company_id, action_type=action_type, summary=summary, actor=actor or "system",
            related_id=draft.id,
            details={"draft_id": draft.id, "recipient": draft.recipient, "subject": draft.subject,
                     "author": draft.author, "revision": draft.revision, **details},
        )
    except Exception:  # the audit trail must never undo or block the action it records
        db.rollback()


def _expire_if_due(db, draft, now):
    if draft.status == PENDING and draft.expires_at <= now:
        draft.status = EXPIRED
        draft.updated_at = now
        db.commit()


def get_draft(db, company_id, draft_id, now=None):
    now = now or naive_utcnow()
    draft = (
        db.query(EmailDraft)
        .filter(EmailDraft.id == str(draft_id), EmailDraft.company_id == company_id)
        .first()
    )
    if draft is None:
        raise DraftNotFound("Draft not found.")
    _expire_if_due(db, draft, now)
    return draft


def list_drafts(db, company_id, status=PENDING, limit=50, now=None):
    now = now or naive_utcnow()
    query = db.query(EmailDraft).filter(EmailDraft.company_id == company_id)
    if status:
        query = query.filter(EmailDraft.status == status)
    drafts = query.order_by(EmailDraft.created_at.desc()).limit(max(1, min(limit, 100))).all()
    live = []
    for draft in drafts:
        _expire_if_due(db, draft, now)
        if not status or draft.status == status:
            live.append(draft)
    return live


def create_draft(db, *, company_id, message_id, body, author, created_by, conn=None, now=None):
    """Write a reply to a draft. Raises DraftError (or GmailReauthorizationRequired / requests errors)."""
    now = now or naive_utcnow()
    if not isinstance(message_id, str) or not MESSAGE_ID_RE.fullmatch(message_id):
        raise DraftInvalid("message_id must be a valid Gmail message ID.")
    body = clean_body(body)

    conn = conn or active_gmail_connection(db, company_id)
    if conn is None:
        raise DraftNotFound("No Gmail connection is active for this workspace.")
    if not can_send(conn):
        raise DraftForbidden(
            "This Gmail connection is read-only and cannot send replies. "
            "Disconnect and reconnect Gmail, then approve the gmail.send permission."
        )

    waiting = (
        db.query(EmailDraft)
        .filter(EmailDraft.company_id == company_id, EmailDraft.status == PENDING, EmailDraft.expires_at > now)
        .count()
    )
    if waiting >= MAX_PENDING:
        raise DraftConflict("Too many drafts are waiting for approval. Approve or discard some first.")

    access, refresh = load_tokens(db, conn)
    source, token = get_message_with_refresh(access, refresh, message_id)
    if token != access:
        save_access_token(db, conn, token)

    try:
        # Validates the original headers and fixes who the reply goes to. The raw MIME is
        # rebuilt at send time; here we only keep the parts the approver needs to see.
        reply = build_gmail_reply(source, body, conn.provider_user_email)
    except ValueError as exc:
        raise DraftInvalid(str(exc)) from exc
    summary = extract_message_summary(source)

    # One live draft per original message: a newer one replaces any still waiting.
    (
        db.query(EmailDraft)
        .filter(EmailDraft.company_id == company_id, EmailDraft.source_message_id == message_id,
                EmailDraft.status == PENDING)
        .update({"status": DISCARDED, "last_error": "Replaced by a newer draft.", "updated_at": now},
                synchronize_session=False)
    )

    draft = EmailDraft(
        id=f"DRF-{uuid.uuid4().hex[:12].upper()}",
        company_id=company_id,
        connection_id=conn.id,
        source_message_id=message_id,
        thread_id=reply["thread_id"],
        recipient=reply["recipient"],
        subject=reply["subject"],
        body=body,
        revision=1,
        status=PENDING,
        author=author,
        created_by=created_by,
        source_from=(summary.get("from") or "")[:200],
        source_subject=(summary.get("subject") or "")[:200],
        source_snippet=(summary.get("snippet") or "")[:300],
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(hours=draft_ttl_hours()),
    )
    db.add(draft)
    db.commit()
    _audit(db, company_id, "email_draft_created",
           f"{'AI' if author == 'agent' else 'A person'} drafted a reply to {draft.recipient}; not sent.",
           created_by or author, draft)
    return draft


def update_body(db, *, company_id, draft_id, body, revision, editor, now=None):
    now = now or naive_utcnow()
    draft = get_draft(db, company_id, draft_id, now)
    if draft.status != PENDING:
        raise DraftConflict(f"This draft is {draft.status} and can't be edited.")
    if revision != draft.revision:
        raise DraftConflict("This draft changed since you opened it. Reload it and review the latest text.")
    body = clean_body(body)
    changed = (
        update(EmailDraft)
        .where(EmailDraft.id == draft.id, EmailDraft.company_id == company_id,
               EmailDraft.status == PENDING, EmailDraft.revision == revision)
        .values(body=body, revision=revision + 1, updated_at=now)
        .returning(EmailDraft.id)
    )
    if db.execute(changed).first() is None:
        db.rollback()
        raise DraftConflict("This draft changed while you were editing it. Reload it and try again.")
    db.commit()
    db.refresh(draft)
    _audit(db, company_id, "email_draft_edited", f"Reply to {draft.recipient} was edited; not sent.", editor, draft)
    return draft


def discard(db, *, company_id, draft_id, actor, now=None):
    now = now or naive_utcnow()
    draft = get_draft(db, company_id, draft_id, now)
    if draft.status != PENDING:
        raise DraftConflict(f"This draft is {draft.status} and can't be discarded.")
    gone = (
        update(EmailDraft)
        .where(EmailDraft.id == draft.id, EmailDraft.company_id == company_id, EmailDraft.status == PENDING)
        .values(status=DISCARDED, updated_at=now)
        .returning(EmailDraft.id)
    )
    if db.execute(gone).first() is None:
        db.rollback()
        raise DraftConflict("This draft was just sent or changed.")
    db.commit()
    db.refresh(draft)
    _audit(db, company_id, "email_draft_discarded", f"Reply to {draft.recipient} was discarded; not sent.", actor, draft)
    return draft


def _settle(db, draft_id, status, error=None, sent_message_id=None, now=None):
    """Record how a send ended, in a clean transaction."""
    now = now or naive_utcnow()
    db.rollback()
    values = {"status": status, "last_error": error, "updated_at": now}
    if status == SENT:
        values.update(sent_at=now, sent_message_id=sent_message_id)
    db.execute(update(EmailDraft).where(EmailDraft.id == draft_id).values(**values))
    db.commit()


def approve_and_send(db, *, company_id, draft_id, revision, approver, now=None):
    """Send a draft because a person approved exactly this revision. Returns the draft (status 'sent')."""
    now = now or naive_utcnow()
    draft = get_draft(db, company_id, draft_id, now)

    if draft.status == EXPIRED:
        raise DraftConflict("This draft expired. Ask for a new one.")
    if draft.status != PENDING:
        raise DraftConflict(f"This draft is already {draft.status}.")
    if revision != draft.revision:
        raise DraftConflict("This draft changed since you reviewed it. Review the latest text, then approve again.")

    recent = (
        db.query(EmailDraft)
        .filter(EmailDraft.company_id == company_id, EmailDraft.status.in_((SENT, SENDING)),
                EmailDraft.updated_at >= now - timedelta(hours=1))
        .count()
    )
    if recent >= sends_per_hour():
        raise DraftRateLimited("This workspace has reached its hourly limit for emails sent from Aiviate. Try again later.")

    conn = active_gmail_connection(db, company_id)
    if conn is None:
        raise DraftNotFound("No Gmail connection is active for this workspace.")
    if not can_send(conn):
        raise DraftForbidden("This Gmail connection is read-only and cannot send replies. Reconnect Gmail and allow sending.")

    # The claim: only one request can move this exact revision from pending to sending.
    claim = (
        update(EmailDraft)
        .where(EmailDraft.id == draft.id, EmailDraft.company_id == company_id, EmailDraft.status == PENDING,
               EmailDraft.revision == revision, EmailDraft.expires_at > now)
        .values(status=SENDING, approved_by=approver, approved_at=now, updated_at=now, last_error=None)
        .returning(EmailDraft.id)
    )
    if db.execute(claim).first() is None:
        db.rollback()
        raise DraftConflict("This draft was just sent, changed or discarded.")
    db.commit()
    _audit(db, company_id, "email_draft_approved", f"Reply to {draft.recipient} was approved for sending.", approver, draft)

    draft_id, body, source_id, recipient = draft.id, draft.body, draft.source_message_id, draft.recipient
    try:
        access, refresh = load_tokens(db, conn)
        result, token = send_gmail_reply_with_refresh(
            access, refresh, source_id, body, conn.provider_user_email, expected_recipient=recipient,
        )
    except ValueError as exc:  # nothing was sent, and as drafted it never can be (e.g. address changed)
        _settle(db, draft_id, FAILED, str(exc))
        _audit(db, company_id, "email_send_failed", f"Reply to {recipient} was not sent: {exc}", approver, draft)
        raise DraftInvalid(str(exc)) from exc
    except GmailReauthorizationRequired as exc:  # nothing was sent; fixable by reconnecting
        _settle(db, draft_id, PENDING, str(exc))
        raise
    except requests.HTTPError as exc:
        code = exc.response.status_code if exc.response is not None else 0
        if 400 <= code < 500 and code not in (408, 429):  # Google refused it outright: not sent
            _settle(db, draft_id, PENDING, f"Gmail refused the reply (HTTP {code}).")
            raise
        _settle(db, draft_id, UNKNOWN, f"Gmail did not confirm the reply (HTTP {code or 'no response'}).")
        _audit(db, company_id, "email_send_uncertain", f"Reply to {recipient}: Gmail did not confirm.", approver, draft)
        raise DraftUncertain("Gmail did not confirm the reply. Check Sent before creating a new draft, to avoid a duplicate.") from exc
    except requests.RequestException as exc:
        _settle(db, draft_id, UNKNOWN, "Gmail did not respond.")
        _audit(db, company_id, "email_send_uncertain", f"Reply to {recipient}: Gmail did not respond.", approver, draft)
        raise DraftUncertain("Gmail did not confirm the reply. Check Sent before creating a new draft, to avoid a duplicate.") from exc

    if token != access:
        try:
            save_access_token(db, conn, token)
        except Exception:
            db.rollback()
    _settle(db, draft_id, SENT, sent_message_id=result.get("id"))
    draft = get_draft(db, company_id, draft_id)
    _audit(db, company_id, "email_reply_sent", f"Reply sent to {draft.recipient}.", approver, draft,
           gmail_message_id=result.get("id"))
    return draft

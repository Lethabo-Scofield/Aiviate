"""A company's Gmail connection and its stored tokens.

Every caller goes through here, so there is one place that decides how tokens are
read, how a refreshed access token is saved, and what happens to rows still stored
in the old reversible format (they are re-saved as encrypted on first use).
"""
from models import (
    IntegrationConnection,
    IntegrationTokenError,
    is_legacy_integration_token,
    protect_integration_token,
    reveal_integration_token,
)

from .gmail_service import GMAIL_SEND_SCOPE, GmailReauthorizationRequired


def active_gmail_connection(db, company_id):
    return (
        db.query(IntegrationConnection)
        .filter(
            IntegrationConnection.company_id == company_id,
            IntegrationConnection.provider == "gmail",
            IntegrationConnection.is_active.is_(True),
        )
        .first()
    )


def can_send(conn):
    scopes = conn.scopes or []
    if isinstance(scopes, str):
        scopes = scopes.split()
    return GMAIL_SEND_SCOPE in scopes


def load_tokens(db, conn):
    """(access_token, refresh_token) in plaintext.

    Raises GmailReauthorizationRequired when the stored value can't be read, which the
    callers already turn into a "reconnect Gmail" message. A value still in the old
    format is re-saved encrypted.
    """
    try:
        access = reveal_integration_token(conn.access_token)
        refresh = reveal_integration_token(conn.refresh_token)
    except IntegrationTokenError as exc:
        raise GmailReauthorizationRequired(str(exc)) from exc

    if is_legacy_integration_token(conn.access_token) or is_legacy_integration_token(conn.refresh_token):
        conn.access_token = protect_integration_token(access)
        conn.refresh_token = protect_integration_token(refresh)
        db.commit()
    return access, refresh


def save_access_token(db, conn, token):
    conn.access_token = protect_integration_token(token)
    db.commit()

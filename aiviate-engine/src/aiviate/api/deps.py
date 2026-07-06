"""API dependencies: authentication, tenancy, RBAC, idempotency, rate limiting.

Tenant isolation is structural: every downstream query takes the principal's
organisation_id from the verified API key — never from the request body.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from aiviate.db import tables as t
from aiviate.domain.enums import Role
from aiviate.observability import metrics


def hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


@dataclass
class Principal:
    organisation_id: str
    role: Role
    driver_id: str | None = None
    device_id: str | None = None
    api_key_id: str = ""


def get_session(request: Request) -> Iterator[Session]:
    session = request.app.state.session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_principal(
    request: Request,
    session: Session = Depends(get_session),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> Principal:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header.")
    row = session.execute(
        select(t.ApiKeyRow).where(
            t.ApiKeyRow.key_hash == hash_key(x_api_key),
            t.ApiKeyRow.active.is_(True),
        )
    ).scalar_one_or_none()
    if row is None:
        metrics.increment("api.auth_failures")
        raise HTTPException(status_code=401, detail="Invalid API key.")
    _rate_limit(request, row.id)
    return Principal(
        organisation_id=row.organisation_id,
        role=Role(row.role),
        driver_id=row.driver_id,
        device_id=row.device_id,
        api_key_id=row.id,
    )


def require_roles(*roles: Role):
    def checker(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient role for this operation.")
        return principal

    return checker


require_admin = require_roles(Role.ADMIN)
require_dispatcher = require_roles(Role.ADMIN, Role.DISPATCHER)
require_driver = require_roles(Role.DRIVER)
require_device_or_admin = require_roles(Role.DEVICE, Role.ADMIN, Role.DISPATCHER)


# --- webhook signatures -------------------------------------------------------


async def verify_webhook_signature(request: Request, session: Session, organisation_id: str) -> None:
    """HMAC-SHA256 of the raw body with the organisation's webhook secret."""
    signature = request.headers.get("X-Webhook-Signature")
    if not signature:
        raise HTTPException(status_code=401, detail="Missing X-Webhook-Signature header.")
    org = session.get(t.OrganisationRow, organisation_id)
    if org is None or not org.webhook_secret:
        raise HTTPException(status_code=401, detail="Webhook signing is not configured.")
    body = await request.body()
    expected = hmac.new(org.webhook_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        metrics.increment("api.webhook_signature_failures")
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")


# --- idempotency ---------------------------------------------------------------


def idempotency_replay(
    session: Session,
    organisation_id: str,
    endpoint: str,
    key: str | None,
    request_body: Any,
) -> dict[str, Any] | None:
    """Return the stored response if this (org, endpoint, key) was already seen.

    Reusing a key with a different payload is a 422 — silent divergence is
    worse than an error.
    """
    if key is None:
        return None
    request_hash = hashlib.sha256(
        json.dumps(request_body, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()
    row = session.execute(
        select(t.IdempotencyKeyRow).where(
            t.IdempotencyKeyRow.organisation_id == organisation_id,
            t.IdempotencyKeyRow.endpoint == endpoint,
            t.IdempotencyKeyRow.key == key,
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    if row.request_hash != request_hash:
        raise HTTPException(
            status_code=422,
            detail="Idempotency key was already used with a different payload.",
        )
    metrics.increment("api.idempotent_replays")
    return {"status_code": row.response_status, "body": row.response_body}


def idempotency_store(
    session: Session,
    organisation_id: str,
    endpoint: str,
    key: str | None,
    request_body: Any,
    status_code: int,
    response_body: dict[str, Any],
) -> None:
    if key is None:
        return
    request_hash = hashlib.sha256(
        json.dumps(request_body, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()
    session.add(
        t.IdempotencyKeyRow(
            organisation_id=organisation_id,
            endpoint=endpoint,
            key=key,
            request_hash=request_hash,
            response_status=status_code,
            response_body=response_body,
        )
    )


# --- rate limiting -------------------------------------------------------------


class _RateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._windows: dict[str, tuple[float, int]] = {}

    def allow(self, key: str, per_minute: int) -> bool:
        now = time.monotonic()
        with self._lock:
            window_start, count = self._windows.get(key, (now, 0))
            if now - window_start >= 60.0:
                window_start, count = now, 0
            count += 1
            self._windows[key] = (window_start, count)
            return count <= per_minute


_rate_limiter = _RateLimiter()


def _rate_limit(request: Request, api_key_id: str) -> None:
    per_minute = getattr(request.app.state, "rate_limit_per_minute", 240)
    if not _rate_limiter.allow(api_key_id, per_minute):
        metrics.increment("api.rate_limited")
        raise HTTPException(status_code=429, detail="Rate limit exceeded.")

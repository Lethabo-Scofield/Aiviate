"""Order intake: creation, bulk import (idempotent, optionally webhook-signed)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from aiviate.api import deps
from aiviate.api.schemas import OrderImportIn, OrderIn
from aiviate.db.repo import OrderRepo, OrganisationRepo
from aiviate.domain import models as m
from aiviate.rules import resolve_rules
from aiviate.validation import validate_order

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


def ingest_orders(
    session: Session,
    geocoding_service,
    organisation_id: str,
    orders_in: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Validate + geocode a batch. Invalid orders are stored as invalid and
    never proceed; valid ones are geocoded (low confidence → review queue)."""
    org = OrganisationRepo.get(session, organisation_id)
    assert org is not None
    rules = resolve_rules(org.operating_rules)
    known = OrderRepo.by_external_ids(
        session, organisation_id, [o.get("external_order_id", "") for o in orders_in]
    )
    results: list[dict[str, Any]] = []
    for payload in orders_in:
        validation = validate_order(payload, rules, organisation_id, known_external_ids=known)
        if not validation.is_valid:
            results.append(validation.model_dump())
            continue
        known.add(payload["external_order_id"])
        order = m.Order.model_validate({**payload, "organisation_id": organisation_id})
        OrderRepo.save(session, order)  # persist before geocoding: review rows FK the order
        session.flush()

        review_reason = None
        duplicates: list[str] = []
        if order.latitude is not None and order.longitude is not None:
            # Source-provided coordinates were already validated (range +
            # service area) — trust them and skip provider geocoding.
            from aiviate.domain.enums import OrderStatus
            from aiviate.geocoding.service import normalise_address

            order.normalised_address = normalise_address(order.raw_address)
            order.geocoding_confidence = order.geocoding_confidence or 1.0
            order.status = OrderStatus.READY
        else:
            outcome = geocoding_service.geocode_order(session, order, rules)
            review_reason = outcome.review_reason
            duplicates = outcome.duplicate_of_order_ids
        OrderRepo.save(session, order)
        results.append(
            {
                "order_id": order.id,
                "external_order_id": order.external_order_id,
                "status": str(order.status),
                "geocoding_confidence": order.geocoding_confidence,
                "review_reason": review_reason,
                "duplicate_of_order_ids": duplicates,
                "errors": [],
            }
        )
    return results


@router.post("", status_code=201)
def create_order(
    body: OrderIn,
    request: Request,
    principal: deps.Principal = Depends(deps.require_dispatcher),
    session: Session = Depends(deps.get_session),
):
    [result] = ingest_orders(
        session, request.app.state.geocoding_service, principal.organisation_id,
        [body.model_dump()],
    )
    return result


@router.post("/import")
async def import_orders(
    body: OrderImportIn,
    request: Request,
    principal: deps.Principal = Depends(deps.require_dispatcher),
    session: Session = Depends(deps.get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    x_webhook_signature: str | None = Header(default=None, alias="X-Webhook-Signature"),
):
    payload = body.model_dump(mode="json")
    replay = deps.idempotency_replay(
        session, principal.organisation_id, "orders/import", idempotency_key, payload
    )
    if replay is not None:
        return replay["body"]
    if x_webhook_signature is not None:
        await deps.verify_webhook_signature(request, session, principal.organisation_id)

    job_id = request.app.state.job_queue.enqueue(
        "orders_import",
        {"organisation_id": principal.organisation_id, "orders": payload["orders"]},
        organisation_id=principal.organisation_id,
    )
    response = {"job_id": job_id, **(request.app.state.job_queue.status(job_id) or {})}
    deps.idempotency_store(
        session, principal.organisation_id, "orders/import", idempotency_key,
        payload, 200, response,
    )
    return response


@router.get("")
def list_orders(
    status: str | None = None,
    principal: deps.Principal = Depends(deps.require_dispatcher),
    session: Session = Depends(deps.get_session),
):
    orders = OrderRepo.list(
        session, principal.organisation_id, statuses=[status] if status else None
    )
    return {"orders": [o.model_dump(mode="json") for o in orders]}

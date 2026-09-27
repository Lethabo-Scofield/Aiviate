"""Operational and safety events."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from aiviate.api import deps
from aiviate.api.schemas import SafetyEventIn
from aiviate.db import tables as t
from aiviate.domain import models as m
from aiviate.domain.enums import SAFETY_EVENT_TYPES, PlanStatus, Role
from aiviate.safety import process_safety_event

router = APIRouter(prefix="/api/v1/events", tags=["events"])


@router.post("/safety", status_code=202)
def post_safety_event(
    body: SafetyEventIn,
    request: Request,
    principal: deps.Principal = Depends(
        deps.require_roles(Role.DEVICE, Role.DRIVER, Role.ADMIN, Role.DISPATCHER)
    ),
    session: Session = Depends(deps.get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    if body.event_type not in SAFETY_EVENT_TYPES:
        raise HTTPException(status_code=422, detail="Not a safety event type.")

    event = m.OperationalEvent(
        organisation_id=principal.organisation_id,
        route_id=body.route_id,
        driver_id=body.driver_id or principal.driver_id,
        vehicle_id=body.vehicle_id,
        event_type=body.event_type,
        severity=body.severity,
        latitude=body.latitude,
        longitude=body.longitude,
        payload=body.payload,
        occurred_at=body.occurred_at or m.utc_now(),
    )
    dedupe = idempotency_key or body.payload.get("event_id")
    result = process_safety_event(
        session, principal.organisation_id, event, dedupe_key=dedupe
    )
    # Commit before enqueueing: the re-optimisation job runs on its own
    # connection and must see the safety actions (and, on SQLite, must be able
    # to acquire the write lock this request would otherwise hold).
    session.commit()

    reopt_job_id = None
    if result.reoptimisation_required and not result.duplicate:
        plan_id = _published_plan_for_route(
            session, principal.organisation_id, result.reoptimisation_route_id
        )
        if plan_id is not None:
            reopt_job_id = request.app.state.job_queue.enqueue(
                "reoptimise_plan",
                {
                    "organisation_id": principal.organisation_id,
                    "plan_id": plan_id,
                    "reason": str(event.event_type),
                    "route_id": result.reoptimisation_route_id,
                    "driver_id": event.driver_id,
                    "interrupt_active_stop": bool(result.returned_order_ids),
                },
                organisation_id=principal.organisation_id,
            )

    return {
        "event_id": result.event_id,
        "duplicate": result.duplicate,
        "actions": result.actions,
        "driver_safety_status": result.driver_safety_status,
        "route_status": result.route_status,
        "returned_order_ids": result.returned_order_ids,
        "reoptimisation_job_id": reopt_job_id,
    }


@router.get("")
def list_events(
    event_type: str | None = None,
    principal: deps.Principal = Depends(deps.require_dispatcher),
    session: Session = Depends(deps.get_session),
):
    stmt = (
        select(t.OperationalEventRow)
        .where(t.OperationalEventRow.organisation_id == principal.organisation_id)
        .order_by(t.OperationalEventRow.occurred_at.desc())
        .limit(500)
    )
    if event_type:
        stmt = stmt.where(t.OperationalEventRow.event_type == event_type)
    rows = session.execute(stmt).scalars()
    return {
        "events": [
            {
                "id": row.id,
                "event_type": row.event_type,
                "severity": row.severity,
                "route_id": row.route_id,
                "driver_id": row.driver_id,
                "vehicle_id": row.vehicle_id,
                "payload": row.payload,
                "occurred_at": row.occurred_at.isoformat(),
                "processed_at": row.processed_at.isoformat() if row.processed_at else None,
            }
            for row in rows
        ]
    }


def _published_plan_for_route(session: Session, organisation_id: str, route_id: str | None):
    if route_id is None:
        return None
    row = session.execute(
        select(t.DispatchPlanRow.id)
        .join(t.RouteRow, t.RouteRow.plan_id == t.DispatchPlanRow.id)
        .where(
            t.RouteRow.id == route_id,
            t.DispatchPlanRow.organisation_id == organisation_id,
            t.DispatchPlanRow.status == PlanStatus.PUBLISHED,
        )
    ).scalar_one_or_none()
    return row

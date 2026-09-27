"""Driver-facing endpoints: active route retrieval and stop status updates.

A driver principal can only ever see and mutate their own route — the
driver_id bound to the API key wins over anything in the URL or body.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from aiviate.api import deps
from aiviate.api.schemas import StopPatchIn
from aiviate.db import tables as t
from aiviate.db.repo import OrderRepo, PlanRepo
from aiviate.domain.enums import OrderStatus, PlanStatus, Role, RouteStatus, StopStatus

router = APIRouter(prefix="/api/v1", tags=["fleet"])

_STOP_TRANSITIONS: dict[StopStatus, set[StopStatus]] = {
    StopStatus.PENDING: {StopStatus.ACTIVE, StopStatus.FAILED},
    StopStatus.ACTIVE: {StopStatus.COMPLETED, StopStatus.FAILED},
    StopStatus.COMPLETED: set(),  # completed stops are immutable
    StopStatus.FAILED: set(),
    StopStatus.RETURNED: set(),
}

_ORDER_STATUS_FOR_STOP = {
    StopStatus.ACTIVE: OrderStatus.IN_TRANSIT,
    StopStatus.COMPLETED: OrderStatus.DELIVERED,
    StopStatus.FAILED: OrderStatus.FAILED,
}


def _authorise_driver(principal: deps.Principal, driver_id: str) -> None:
    if principal.role == Role.DRIVER and principal.driver_id != driver_id:
        raise HTTPException(status_code=403, detail="Drivers may only access their own routes.")


@router.get("/drivers/{driver_id}/active-route")
def active_route(
    driver_id: str,
    principal: deps.Principal = Depends(
        deps.require_roles(Role.DRIVER, Role.ADMIN, Role.DISPATCHER)
    ),
    session: Session = Depends(deps.get_session),
):
    _authorise_driver(principal, driver_id)
    row = session.execute(
        select(t.RouteRow)
        .join(t.DispatchPlanRow, t.RouteRow.plan_id == t.DispatchPlanRow.id)
        .where(
            t.DispatchPlanRow.organisation_id == principal.organisation_id,
            t.DispatchPlanRow.status == PlanStatus.PUBLISHED,
            t.RouteRow.driver_id == driver_id,
            t.RouteRow.status.in_([RouteStatus.PLANNED, RouteStatus.ACTIVE]),
        )
        .order_by(t.RouteRow.id)
    ).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="No active route for this driver.")
    stops = PlanRepo.stops(session, row.id)
    from aiviate.db.repo import to_domain
    from aiviate.domain import models as m

    route = to_domain(row, m.Route)
    return {
        "route": route.model_dump(mode="json"),
        "stops": [s.model_dump(mode="json") for s in stops],
    }


@router.patch("/routes/{route_id}/stops/{stop_id}")
def update_stop(
    route_id: str,
    stop_id: str,
    body: StopPatchIn,
    principal: deps.Principal = Depends(
        deps.require_roles(Role.DRIVER, Role.ADMIN, Role.DISPATCHER)
    ),
    session: Session = Depends(deps.get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    payload = {"route_id": route_id, "stop_id": stop_id, "status": str(body.status)}
    endpoint = f"routes/{route_id}/stops/{stop_id}"
    replay = deps.idempotency_replay(
        session, principal.organisation_id, endpoint, idempotency_key, payload
    )
    if replay is not None:
        return replay["body"]

    stop_row = session.get(t.RouteStopRow, stop_id)
    route_row = session.get(t.RouteRow, route_id)
    if stop_row is None or route_row is None or stop_row.route_id != route_id:
        raise HTTPException(status_code=404, detail="Stop not found.")
    plan_row = session.get(t.DispatchPlanRow, route_row.plan_id)
    if plan_row is None or plan_row.organisation_id != principal.organisation_id:
        raise HTTPException(status_code=404, detail="Stop not found.")
    _authorise_driver(principal, route_row.driver_id)

    current = StopStatus(stop_row.status)
    if body.status not in _STOP_TRANSITIONS[current]:
        raise HTTPException(
            status_code=409,
            detail=f"Illegal stop transition {current} → {body.status}.",
        )
    stop_row.status = body.status
    if route_row.status == RouteStatus.PLANNED and body.status == StopStatus.ACTIVE:
        route_row.status = RouteStatus.ACTIVE

    order_status = _ORDER_STATUS_FOR_STOP.get(body.status)
    if order_status is not None:
        order = OrderRepo.get(session, principal.organisation_id, stop_row.order_id)
        if order is not None:
            order.status = order_status
            OrderRepo.save(session, order)

    # Route completes when every stop reached a terminal state.
    siblings = session.execute(
        select(t.RouteStopRow.status).where(t.RouteStopRow.route_id == route_id)
    ).scalars().all()
    terminal = {StopStatus.COMPLETED, StopStatus.FAILED, StopStatus.RETURNED}
    if all(StopStatus(s) in terminal for s in siblings):
        route_row.status = RouteStatus.COMPLETED

    response = {
        "stop_id": stop_id,
        "status": str(body.status),
        "route_status": str(route_row.status),
    }
    deps.idempotency_store(
        session, principal.organisation_id, endpoint, idempotency_key, payload, 200, response,
    )
    return response

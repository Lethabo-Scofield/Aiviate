"""Dispatch plans: creation, retrieval, approval, rejection, re-optimisation,
explanations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from aiviate.api import deps
from aiviate.api.schemas import PlanCreateIn, PlanRejectIn, ReoptimiseIn
from aiviate.audit import plan_explanation
from aiviate.db.repo import PlanRepo
from aiviate.engine import PlanningError, approve_plan, reject_plan

router = APIRouter(prefix="/api/v1", tags=["dispatch"])


@router.post("/dispatch/plans", status_code=202)
def create_dispatch_plan(
    body: PlanCreateIn,
    request: Request,
    principal: deps.Principal = Depends(deps.require_dispatcher),
    session: Session = Depends(deps.get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    payload = body.model_dump(mode="json")
    replay = deps.idempotency_replay(
        session, principal.organisation_id, "dispatch/plans", idempotency_key, payload
    )
    if replay is not None:
        return replay["body"]

    job_id = request.app.state.job_queue.enqueue(
        "create_plan",
        {"organisation_id": principal.organisation_id, **payload},
        organisation_id=principal.organisation_id,
    )
    response = {"job_id": job_id, **(request.app.state.job_queue.status(job_id) or {})}
    deps.idempotency_store(
        session, principal.organisation_id, "dispatch/plans", idempotency_key,
        payload, 202, response,
    )
    return response


@router.get("/dispatch/plans/{plan_id}")
def get_plan(
    plan_id: str,
    principal: deps.Principal = Depends(deps.require_dispatcher),
    session: Session = Depends(deps.get_session),
):
    plan = PlanRepo.get(session, principal.organisation_id, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found.")
    routes = PlanRepo.routes(session, plan_id)
    return {
        "plan": plan.model_dump(mode="json"),
        "routes": [
            {
                **route.model_dump(mode="json"),
                "stops": [s.model_dump(mode="json") for s in PlanRepo.stops(session, route.id)],
            }
            for route in routes
        ],
    }


@router.post("/dispatch/plans/{plan_id}/approve")
def approve(
    plan_id: str,
    principal: deps.Principal = Depends(deps.require_admin),
    session: Session = Depends(deps.get_session),
):
    try:
        plan = approve_plan(session, principal.organisation_id, plan_id,
                            actor=principal.api_key_id)
    except PlanningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"plan": plan.model_dump(mode="json")}


@router.post("/dispatch/plans/{plan_id}/reject")
def reject(
    plan_id: str,
    body: PlanRejectIn,
    principal: deps.Principal = Depends(deps.require_admin),
    session: Session = Depends(deps.get_session),
):
    try:
        plan = reject_plan(session, principal.organisation_id, plan_id,
                           actor=principal.api_key_id, note=body.note)
    except PlanningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"plan": plan.model_dump(mode="json")}


@router.post("/dispatch/plans/{plan_id}/reoptimise", status_code=202)
def reoptimise(
    plan_id: str,
    body: ReoptimiseIn,
    request: Request,
    principal: deps.Principal = Depends(deps.require_dispatcher),
    session: Session = Depends(deps.get_session),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    payload = body.model_dump(mode="json")
    endpoint = f"dispatch/plans/{plan_id}/reoptimise"
    replay = deps.idempotency_replay(
        session, principal.organisation_id, endpoint, idempotency_key, payload
    )
    if replay is not None:
        return replay["body"]

    job_id = request.app.state.job_queue.enqueue(
        "reoptimise_plan",
        {"organisation_id": principal.organisation_id, "plan_id": plan_id, **payload},
        organisation_id=principal.organisation_id,
    )
    response = {"job_id": job_id, **(request.app.state.job_queue.status(job_id) or {})}
    deps.idempotency_store(
        session, principal.organisation_id, endpoint, idempotency_key, payload, 202, response,
    )
    return response


@router.get("/plans/{plan_id}/explanation")
def explanation(
    plan_id: str,
    principal: deps.Principal = Depends(deps.require_dispatcher),
    session: Session = Depends(deps.get_session),
):
    if PlanRepo.get(session, principal.organisation_id, plan_id) is None:
        raise HTTPException(status_code=404, detail="Plan not found.")
    return plan_explanation(session, principal.organisation_id, plan_id)


@router.get("/jobs/{job_id}")
def job_status(
    job_id: str,
    request: Request,
    principal: deps.Principal = Depends(deps.require_dispatcher),
):
    status = request.app.state.job_queue.status(job_id)
    if status is None or status.get("organisation_id") != principal.organisation_id:
        raise HTTPException(status_code=404, detail="Job not found.")
    return status

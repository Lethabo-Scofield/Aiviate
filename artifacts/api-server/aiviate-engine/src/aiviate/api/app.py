"""FastAPI application factory.

Wires settings → database → providers → job queue → routers, and installs the
correlation-ID middleware. Run with:

    uvicorn aiviate.api.app:create_app --factory
"""

from __future__ import annotations

from datetime import datetime

from fastapi import FastAPI, Request
from sqlalchemy.orm import Session, sessionmaker

from aiviate.api.routers import config, events, fleet, orders, plans
from aiviate.config import Settings, get_settings
from aiviate.db.base import Base, _make_engine
from aiviate.engine import PlanningError, create_plan
from aiviate.factories import build_geocoding_service, build_matrix_service
from aiviate.jobs import JobQueue
from aiviate.observability import (
    configure_logging,
    get_logger,
    metrics,
    set_correlation_id,
)
from aiviate.reoptimization import reoptimise_plan
from aiviate.reoptimization.controller import ReoptimisationTrigger

logger = get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(json_output=settings.log_json)

    engine = _make_engine(settings.database_url, settings.database_echo)
    # Idempotent safety net for local/dev; production applies Alembic
    # migrations explicitly (see README "Database migrations").
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    app = FastAPI(title="Aiviate Decision Engine", version="0.1.0")
    app.state.settings = settings
    app.state.session_factory = session_factory
    app.state.rate_limit_per_minute = settings.rate_limit_per_minute
    app.state.geocoding_service = build_geocoding_service(settings)
    app.state.matrix_service = build_matrix_service(settings)
    app.state.job_queue = _build_job_queue(app, session_factory, settings)

    @app.middleware("http")
    async def correlation_middleware(request: Request, call_next):
        cid = set_correlation_id(request.headers.get("X-Correlation-ID"))
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = cid
        return response

    app.include_router(orders.router)
    app.include_router(plans.router)
    app.include_router(fleet.router)
    app.include_router(events.router)
    app.include_router(config.router)

    @app.get("/healthz", tags=["system"])
    def healthz():
        return {"status": "ok"}

    @app.get("/metrics", tags=["system"])
    def metrics_endpoint():
        return metrics.snapshot()

    return app


def _build_job_queue(app: FastAPI, session_factory: sessionmaker[Session],
                     settings: Settings) -> JobQueue:
    queue = JobQueue(session_factory, eager=settings.jobs_eager)

    def orders_import(session: Session, payload: dict) -> dict:
        from aiviate.api.routers.orders import ingest_orders

        results = ingest_orders(
            session, app.state.geocoding_service, payload["organisation_id"], payload["orders"]
        )
        summary = {
            "total": len(results),
            "accepted": sum(1 for r in results if not r.get("errors")),
            "invalid": sum(1 for r in results if r.get("errors")),
            "results": results,
        }
        return summary

    def create_plan_job(session: Session, payload: dict) -> dict:
        try:
            result = create_plan(
                session,
                app.state.matrix_service,
                payload["organisation_id"],
                datetime.fromisoformat(payload["planning_date"]),
                order_ids=payload.get("order_ids"),
                time_limit_seconds=payload.get("time_limit_seconds",
                                               settings.solver_time_limit_seconds),
            )
        except PlanningError as exc:
            raise RuntimeError(str(exc)) from exc
        return {
            "plan_id": result.plan.id,
            "plan_status": str(result.plan.status),
            "solver_status": str(result.solution.status),
            "confidence": result.confidence.score if result.confidence else None,
            "routes": len(result.routes),
            "unassigned_order_ids": result.unassigned_order_ids,
            "validation_errors": [e.model_dump() for e in result.validation.errors],
        }

    def reoptimise_job(session: Session, payload: dict) -> dict:
        try:
            outcome = reoptimise_plan(
                session,
                app.state.matrix_service,
                payload["organisation_id"],
                payload["plan_id"],
                ReoptimisationTrigger(
                    reason=payload["reason"],
                    route_id=payload.get("route_id"),
                    driver_id=payload.get("driver_id"),
                    vehicle_id=payload.get("vehicle_id"),
                    interrupt_active_stop=payload.get("interrupt_active_stop", False),
                    extra_order_ids=payload.get("extra_order_ids", []),
                    delay_minutes=payload.get("delay_minutes", 0.0),
                ),
                time_limit_seconds=payload.get("time_limit_seconds",
                                               settings.solver_time_limit_seconds),
            )
        except PlanningError as exc:
            raise RuntimeError(str(exc)) from exc
        return {
            "new_plan_id": outcome.new_plan.plan.id,
            "new_plan_status": str(outcome.new_plan.plan.status),
            "requires_approval": outcome.requires_approval,
            "diff": outcome.diff,
        }

    queue.register("orders_import", orders_import)
    queue.register("create_plan", create_plan_job)
    queue.register("reoptimise_plan", reoptimise_job)
    # No-retry semantics for plan creation would double-solve; jobs retry only
    # on infrastructure failures because handlers raise RuntimeError on domain
    # errors after rollback, which is safe to retry idempotently here.
    return queue

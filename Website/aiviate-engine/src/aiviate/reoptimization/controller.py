"""Event-driven re-optimisation.

Rules enforced here:
1. Completed stops are preserved — they stay on the previous plan's routes and
   are never handed to the solver again.
2. Active stops keep their driver unless the trigger interrupts that route.
3. Only affected routes and orders re-enter the pool; unaffected routes'
   pending orders are included but locked to their current driver, so
   unaffected drivers cannot be changed.
4. Reassignments are penalised via the previous plan seeding and counted.
5. A difference report is produced for every re-optimisation.
6. Significant operational effect (per organisation policy) forces approval.
7. Drivers are notified only after the new plan validates.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from aiviate.audit import record_decision
from aiviate.db.repo import OrderRepo, OrganisationRepo, PlanRepo
from aiviate.domain import models as m
from aiviate.domain.enums import (
    DecisionType,
    OrderStatus,
    PlanStatus,
    RouteStatus,
    StopStatus,
)
from aiviate.engine import PlanningError, PlanResult, create_plan
from aiviate.matrix import MatrixService
from aiviate.notifications import LoggingNotifier, Notification, Notifier
from aiviate.observability import get_logger, log_ctx, metrics
from aiviate.rules import resolve_rules

logger = get_logger(__name__)


@dataclass
class ReoptimisationTrigger:
    reason: str  # e.g. VEHICLE_BREAKDOWN, DRIVER_DELAY, NEW_URGENT_ORDER
    route_id: str | None = None
    driver_id: str | None = None
    vehicle_id: str | None = None
    interrupt_active_stop: bool = False  # true when the active stop cannot finish
    extra_order_ids: list[str] = field(default_factory=list)  # e.g. new urgent order
    delay_minutes: float = 0.0


@dataclass
class ReoptimisationResult:
    new_plan: PlanResult
    diff: dict[str, Any]
    requires_approval: bool
    notifications: list[Notification]


def reoptimise_plan(
    session: Session,
    matrix_service: MatrixService,
    organisation_id: str,
    plan_id: str,
    trigger: ReoptimisationTrigger,
    notifier: Notifier | None = None,
    time_limit_seconds: int = 10,
) -> ReoptimisationResult:
    notifier = notifier or LoggingNotifier()
    org = OrganisationRepo.get(session, organisation_id)
    previous_plan = PlanRepo.get(session, organisation_id, plan_id)
    if org is None or previous_plan is None:
        raise PlanningError("plan not found")
    if previous_plan.status not in (PlanStatus.PUBLISHED, PlanStatus.APPROVED):
        raise PlanningError(f"only published plans can be re-optimised (status '{previous_plan.status}')")
    rules = resolve_rules(org.operating_rules)

    routes = PlanRepo.routes(session, plan_id)
    affected_route_ids = {
        r.id
        for r in routes
        if r.id == trigger.route_id
        or r.driver_id == trigger.driver_id
        or r.vehicle_id == trigger.vehicle_id
    }
    # A trigger with no resource scope (e.g. new urgent order) affects capacity
    # planning but no existing route directly.

    pool_order_ids: list[str] = list(trigger.extra_order_ids)
    locked_orders: dict[str, str] = {}
    previous_assignment: dict[str, str] = {}
    preserved_completed: list[str] = []

    for route in routes:
        if route.status in (RouteStatus.COMPLETED, RouteStatus.CANCELLED):
            continue
        affected = route.id in affected_route_ids
        for stop in PlanRepo.stops(session, route.id):
            if stop.status in (StopStatus.COMPLETED, StopStatus.FAILED):
                preserved_completed.append(stop.order_id)  # rule 1: never re-planned
                continue
            if stop.status == StopStatus.ACTIVE and not (affected and trigger.interrupt_active_stop):
                # Rule 2: active stops stay with their driver.
                pool_order_ids.append(stop.order_id)
                locked_orders[stop.order_id] = route.driver_id
                previous_assignment[stop.order_id] = route.driver_id
                continue
            pool_order_ids.append(stop.order_id)
            previous_assignment[stop.order_id] = route.driver_id
            if not affected:
                # Rule 3/4: unaffected drivers keep their orders.
                locked_orders[stop.order_id] = route.driver_id

    if not pool_order_ids:
        raise PlanningError("nothing to re-optimise: no open stops or new orders")

    # Return pooled orders to dispatch so the pipeline accepts them.
    for order_id in pool_order_ids:
        order = OrderRepo.get(session, organisation_id, order_id)
        if order is not None and order.status in (OrderStatus.ASSIGNED, OrderStatus.IN_TRANSIT):
            order.status = OrderStatus.RETURNED_TO_DISPATCH
            OrderRepo.save(session, order)
    session.flush()

    new_result = create_plan(
        session,
        matrix_service,
        organisation_id,
        previous_plan.planning_date,
        order_ids=pool_order_ids,
        time_limit_seconds=time_limit_seconds,
        reason=trigger.reason,
        previous_plan_id=plan_id,
        locked_orders=locked_orders,
        previous_assignment=previous_assignment,
        ignore_busy_plan_id=plan_id,
    )

    diff = _difference_report(previous_plan, new_result, previous_assignment, trigger)
    requires_approval = _is_significant(diff, rules, trigger)
    metrics.increment("reoptimisation.runs")
    metrics.increment(f"reoptimisation.reason.{trigger.reason}")

    if new_result.plan.status == PlanStatus.PUBLISHED and requires_approval:
        # Policy overrides auto-publish for significant operational changes.
        new_result.plan.status = PlanStatus.PENDING_APPROVAL
        new_result.plan.approved_at = None
        PlanRepo.save(session, new_result.plan)

    notifications: list[Notification] = []
    if new_result.validation.is_valid and new_result.plan.status == PlanStatus.PUBLISHED:
        _supersede(session, organisation_id, previous_plan)
        notifications = _notify_drivers(notifier, new_result, diff)  # rule 8: only valid plans

    record_decision(
        session, organisation_id, DecisionType.REOPTIMISATION,
        _explain(diff, requires_approval),
        plan_id=new_result.plan.id,
        input_snapshot={
            "trigger": {
                "reason": trigger.reason,
                "route_id": trigger.route_id,
                "driver_id": trigger.driver_id,
                "vehicle_id": trigger.vehicle_id,
                "interrupt_active_stop": trigger.interrupt_active_stop,
            },
            "previous_plan_id": plan_id,
            "pool_order_ids": pool_order_ids,
            "locked_orders": locked_orders,
            "preserved_completed_order_ids": preserved_completed,
        },
        decision_result=diff,
    )
    logger.info("reoptimisation complete", extra=log_ctx(**diff))
    return ReoptimisationResult(
        new_plan=new_result,
        diff=diff,
        requires_approval=requires_approval,
        notifications=notifications,
    )


def _supersede(session: Session, organisation_id: str, previous_plan: m.DispatchPlan) -> None:
    from aiviate.engine import _supersede_previous

    _supersede_previous(session, organisation_id, previous_plan.id)


def _difference_report(previous_plan, new_result: PlanResult, previous_assignment, trigger):
    new_assignment: dict[str, str] = {}
    for route in new_result.routes:
        for stop in new_result.stops[route.id]:
            new_assignment[stop.order_id] = route.driver_id

    reassigned = [
        order_id
        for order_id, driver in new_assignment.items()
        if order_id in previous_assignment and previous_assignment[order_id] != driver
    ]
    affected_drivers = sorted(
        {previous_assignment[o] for o in reassigned}
        | {new_assignment[o] for o in reassigned}
        | ({trigger.driver_id} if trigger.driver_id else set())
    )
    changed_routes = len(
        {new_assignment[o] for o in reassigned} | {previous_assignment[o] for o in reassigned}
    )
    return {
        "previous_plan_id": previous_plan.id,
        "new_plan_id": new_result.plan.id,
        "reason": trigger.reason,
        "changed_routes": changed_routes,
        "reassigned_orders": len(reassigned),
        "reassigned_order_ids": sorted(reassigned),
        "affected_drivers": affected_drivers,
        "unassigned_orders": len(new_result.unassigned_order_ids),
        "estimated_delay_minutes": round(trigger.delay_minutes, 1),
    }


def _is_significant(diff, rules, trigger) -> bool:
    policy = rules.approval
    return (
        diff["reassigned_orders"] > policy.reopt_max_auto_reassigned_orders
        or diff["estimated_delay_minutes"] > policy.reopt_max_auto_delay_minutes
        or diff["unassigned_orders"] > 0
    )


def _notify_drivers(notifier: Notifier, new_result: PlanResult, diff) -> list[Notification]:
    notifications = []
    for route in new_result.routes:
        note = Notification(
            recipient_type="driver",
            recipient_id=route.driver_id,
            subject="Route updated",
            body=(
                f"Your route was re-planned ({diff['reason']}). "
                f"{len(new_result.stops[route.id])} stops, "
                f"estimated {route.estimated_duration:.0f} minutes."
            ),
        )
        notifier.send(note)
        notifications.append(note)
    return notifications


def _explain(diff, requires_approval: bool) -> str:
    return (
        f"Re-optimisation triggered by {diff['reason']}: {diff['reassigned_orders']} order(s) "
        f"reassigned across {diff['changed_routes']} route(s); affected drivers: "
        f"{', '.join(diff['affected_drivers']) or 'none'}; {diff['unassigned_orders']} order(s) "
        f"left unassigned. "
        + (
            "Operational effect is significant — administrator approval required."
            if requires_approval
            else "Within automatic thresholds — published without approval."
        )
    )

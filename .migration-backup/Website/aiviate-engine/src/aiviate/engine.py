"""Planning pipeline: orchestrates the decision-engine workflow.

    validated+geocoded orders → matrix → clustering → solver → independent
    plan validation → confidence scoring → publish / approval / intervention

The pipeline composes the modules; it contains no validation, business-rule
or scoring logic of its own.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from aiviate.assignment import build_candidates, explain_assignment
from aiviate.audit import record_decision
from aiviate.clustering import cluster_orders
from aiviate.clustering.service import ClusterItem
from aiviate.confidence import ConfidenceBreakdown, ConfidenceInputs, DecisionLevel, score_plan
from aiviate.db.repo import DriverRepo, OrderRepo, OrganisationRepo, PlanRepo, VehicleRepo
from aiviate.domain import models as m
from aiviate.domain.enums import (
    DecisionType,
    OrderStatus,
    PlanStatus,
    RouteStatus,
    SafetyStatus,
    SolverStatus,
    StopStatus,
)
from aiviate.domain.geo import Coordinate
from aiviate.matrix import MatrixService
from aiviate.observability import get_logger, log_ctx, metrics
from aiviate.planvalidation import PlanValidationResult, validate_solution
from aiviate.rules import OperatingRules, applied_rule, resolve_rules
from aiviate.solver import OrderNode, SolverInput, SolverOutput, VehicleSpec, solve
from aiviate.solver.model import VehicleRoute

logger = get_logger(__name__)


class PlanningError(Exception):
    """Pipeline cannot proceed (bad configuration or missing resources)."""


@dataclass
class PlanResult:
    plan: m.DispatchPlan
    routes: list[m.Route]
    stops: dict[str, list[m.RouteStop]]  # route_id -> ordered stops
    validation: PlanValidationResult
    confidence: ConfidenceBreakdown | None
    solution: SolverOutput
    unassigned_order_ids: list[str]


def create_plan(
    session: Session,
    matrix_service: MatrixService,
    organisation_id: str,
    planning_date: datetime,
    order_ids: list[str] | None = None,
    time_limit_seconds: int = 10,
    reason: str | None = None,
    previous_plan_id: str | None = None,
    locked_orders: dict[str, str] | None = None,  # order_id -> driver_id it must stay with
    previous_assignment: dict[str, str] | None = None,  # order_id -> driver_id before re-opt
    ignore_busy_plan_id: str | None = None,  # plan being superseded by a re-optimisation
) -> PlanResult:
    org = OrganisationRepo.get(session, organisation_id)
    if org is None:
        raise PlanningError(f"unknown organisation {organisation_id}")
    rules = resolve_rules(org.operating_rules)
    if not rules.depots:
        raise PlanningError("organisation has no approved depot configured")

    orders = OrderRepo.list(
        session,
        organisation_id,
        statuses=[OrderStatus.READY] if order_ids is None else None,
        ids=order_ids,
    )
    orders = [o for o in orders if o.status in (OrderStatus.READY, OrderStatus.RETURNED_TO_DISPATCH)]
    if not orders:
        raise PlanningError("no dispatchable orders")
    for order in orders:
        if order.coordinate is None:
            raise PlanningError(f"order {order.id} has no coordinates; geocode before planning")

    drivers = DriverRepo.list(session, organisation_id)
    vehicles = VehicleRepo.list(session, organisation_id)
    day_start = planning_date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    busy = _busy_resources(session, organisation_id, ignore_busy_plan_id)
    candidates = build_candidates(
        drivers, vehicles, day_start, day_end,
        busy_driver_ids=busy[0], busy_vehicle_ids=busy[1],
    )

    problem, order_by_id = _build_problem(
        session, matrix_service, orders, candidates.candidates, rules, day_start,
        time_limit_seconds, locked_orders, previous_assignment,
    )

    with metrics.timer("pipeline.solve_seconds"):
        solution = solve(problem)

    validation = validate_solution(
        problem,
        solution,
        {d.id: d for d in drivers},
        {v.id: v for v in vehicles},
        organisation_id,
    )

    confidence = None
    if validation.is_valid and solution.status not in (SolverStatus.ERROR, SolverStatus.INFEASIBLE):
        confidence = score_plan(
            _confidence_inputs(problem, solution, validation, order_by_id, candidates.candidates),
            rules.approval,
        )

    plan_result = _persist_plan(
        session, org, rules, problem, solution, validation, confidence,
        order_by_id, candidates.candidates, planning_date, reason, previous_plan_id,
    )
    metrics.increment("pipeline.plans_created")
    if confidence is not None:
        metrics.observe("pipeline.confidence", confidence.score)
    return plan_result


def approve_plan(session: Session, organisation_id: str, plan_id: str, actor: str) -> m.DispatchPlan:
    plan = PlanRepo.get(session, organisation_id, plan_id)
    if plan is None:
        raise PlanningError("plan not found")
    if plan.status != PlanStatus.PENDING_APPROVAL:
        raise PlanningError(f"plan is '{plan.status}', not pending approval")
    plan.status = PlanStatus.PUBLISHED
    plan.approved_at = m.utc_now()
    PlanRepo.save(session, plan)
    _mark_orders_assigned(session, organisation_id, plan_id)
    if plan.previous_plan_id:
        _supersede_previous(session, organisation_id, plan.previous_plan_id)
    record_decision(
        session, organisation_id, DecisionType.PLAN_APPROVED,
        f"Plan approved and published by administrator '{actor}'.",
        plan_id=plan_id, decision_result={"actor": actor},
    )
    return plan


def reject_plan(
    session: Session, organisation_id: str, plan_id: str, actor: str, note: str = ""
) -> m.DispatchPlan:
    plan = PlanRepo.get(session, organisation_id, plan_id)
    if plan is None:
        raise PlanningError("plan not found")
    if plan.status not in (PlanStatus.PENDING_APPROVAL, PlanStatus.DRAFT):
        raise PlanningError(f"plan is '{plan.status}' and cannot be rejected")
    plan.status = PlanStatus.REJECTED
    PlanRepo.save(session, plan)
    _release_plan_orders(session, organisation_id, plan_id)
    record_decision(
        session, organisation_id, DecisionType.PLAN_REJECTED,
        f"Plan rejected by administrator '{actor}'." + (f" Note: {note}" if note else ""),
        plan_id=plan_id, decision_result={"actor": actor, "note": note},
    )
    return plan


# --- internals ---------------------------------------------------------------


def _supersede_previous(session: Session, organisation_id: str, previous_plan_id: str) -> None:
    """Publishing a re-optimised plan retires its predecessor; completed stops
    stay on the old plan's routes, preserving delivery history unmoved."""
    previous = PlanRepo.get(session, organisation_id, previous_plan_id)
    if previous is None or previous.status not in (PlanStatus.PUBLISHED, PlanStatus.APPROVED):
        return
    previous.status = PlanStatus.SUPERSEDED
    PlanRepo.save(session, previous)
    for route in PlanRepo.routes(session, previous.id):
        if route.status in (RouteStatus.PLANNED, RouteStatus.ACTIVE, RouteStatus.SAFETY_HOLD):
            route.status = RouteStatus.CANCELLED
            PlanRepo.save_route(session, route)


def _busy_resources(
    session: Session, organisation_id: str, ignore_plan_id: str | None = None
) -> tuple[set[str], set[str]]:
    """Drivers/vehicles on active routes of published plans. Routes of the plan
    being re-optimised are exempt — those resources are being re-planned."""
    from sqlalchemy import select

    from aiviate.db import tables as t

    stmt = (
        select(t.RouteRow.driver_id, t.RouteRow.vehicle_id)
        .join(t.DispatchPlanRow, t.RouteRow.plan_id == t.DispatchPlanRow.id)
        .where(
            t.DispatchPlanRow.organisation_id == organisation_id,
            t.RouteRow.status.in_([RouteStatus.ACTIVE, RouteStatus.SAFETY_HOLD]),
        )
    )
    if ignore_plan_id is not None:
        stmt = stmt.where(t.RouteRow.plan_id != ignore_plan_id)
    rows = session.execute(stmt).all()
    return {r.driver_id for r in rows}, {r.vehicle_id for r in rows}


def _build_problem(
    session: Session,
    matrix_service: MatrixService,
    orders: list[m.Order],
    candidates,
    rules: OperatingRules,
    horizon_start: datetime,
    time_limit_seconds: int,
    locked_orders: dict[str, str] | None,
    previous_assignment: dict[str, str] | None,
) -> tuple[SolverInput, dict[str, m.Order]]:
    if not candidates:
        raise PlanningError("no eligible driver/vehicle pairs available")

    depot = rules.depots[0]  # MVP: single approved depot per organisation
    points: list[Coordinate] = [depot]
    order_nodes: list[OrderNode] = []
    order_by_id: dict[str, m.Order] = {}

    def seconds(moment: datetime) -> int:
        return max(0, int((moment - horizon_start).total_seconds()))

    driver_to_vehicle_index = {c.driver.id: i for i, c in enumerate(candidates)}

    for order in orders:
        assert order.coordinate is not None
        points.append(order.coordinate)
        allowed = None
        if locked_orders and order.id in locked_orders:
            locked_driver = locked_orders[order.id]
            if locked_driver in driver_to_vehicle_index:
                allowed = [driver_to_vehicle_index[locked_driver]]
        order_nodes.append(
            OrderNode(
                order_id=order.id,
                point=len(points) - 1,
                weight_g=round(order.package_weight * 1000),
                volume_ml=round(order.package_volume * 1_000_000),
                window_start_s=seconds(order.delivery_window_start),
                window_end_s=seconds(order.delivery_window_end),
                allowed_late_s=rules.allowed_late_minutes * 60,
                service_time_s=order.service_time_minutes * 60,
                priority=order.priority,
                allowed_vehicles=allowed,
            )
        )
        order_by_id[order.id] = order

    specs = [
        VehicleSpec(
            driver_id=c.driver.id,
            vehicle_id=c.vehicle.id,
            start_point=0,
            end_point=0,
            weight_capacity_g=round(c.vehicle.maximum_weight * 1000),
            volume_capacity_ml=round(c.vehicle.maximum_volume * 1_000_000),
            shift_start_s=seconds(c.driver.shift_start),
            shift_end_s=seconds(c.driver.shift_end),
            max_overtime_s=rules.max_overtime_minutes * 60,
        )
        for c in candidates
    ]

    # Clustering: capacity-aware initial suggestion, seeded by depot-anchored
    # centroids (driver current locations when known).
    items = [
        ClusterItem(
            order_index=i,
            coordinate=orders[i].coordinate,  # type: ignore[arg-type]
            weight=orders[i].package_weight,
            volume=orders[i].package_volume,
            service_minutes=orders[i].service_time_minutes,
        )
        for i in range(len(orders))
    ]
    seeds = [c.driver.coordinate or depot for c in candidates]
    max_weight = min(c.vehicle.maximum_weight for c in candidates)
    max_volume = min(c.vehicle.maximum_volume for c in candidates)
    clusters = cluster_orders(items, seeds, max_weight, max_volume)
    initial_routes = [
        cluster.order_indices_nearest_neighbour(depot) for cluster in clusters
    ] or None

    previous_by_vehicle = None
    if previous_assignment:
        previous_by_vehicle = {
            order_id: driver_to_vehicle_index[driver_id]
            for order_id, driver_id in previous_assignment.items()
            if driver_id in driver_to_vehicle_index
        }

    with metrics.timer("pipeline.matrix_seconds"):
        matrix = matrix_service.build_matrix(session, points)

    problem = SolverInput(
        horizon_start=horizon_start,
        vehicles=specs,
        orders=order_nodes,
        matrix=matrix,
        weights=rules.weights,
        time_limit_seconds=time_limit_seconds,
        initial_routes=initial_routes,
        previous_assignment=previous_by_vehicle,
    )
    return problem, order_by_id


def _confidence_inputs(
    problem: SolverInput,
    solution: SolverOutput,
    validation: PlanValidationResult,
    order_by_id: dict[str, m.Order],
    candidates,
) -> ConfidenceInputs:
    orders_by_node = {o.order_id: o for o in problem.orders}
    specs = {(s.driver_id, s.vehicle_id): s for s in problem.vehicles}

    weight_utils, volume_utils, shift_utils, slacks = [0.0], [0.0], [0.0], []
    geocode_confidences = []
    drivers_with_warnings = 0
    for route in solution.routes:
        spec = specs[(route.driver_id, route.vehicle_id)]
        weight_utils.append(route.load_weight_g / spec.weight_capacity_g)
        volume_utils.append(route.load_volume_ml / spec.volume_capacity_ml)
        shift_len = max(1, spec.shift_end_s - spec.shift_start_s)
        shift_utils.append(route.duration_s / shift_len)
        for stop in route.stops:
            node = orders_by_node[stop.order_id]
            window = max(1, node.window_end_s - node.window_start_s)
            slacks.append(max(0, node.window_end_s - stop.arrival_s) / window)
            order = order_by_id.get(stop.order_id)
            if order and order.geocoding_confidence is not None:
                geocode_confidences.append(order.geocoding_confidence)
        candidate = next((c for c in candidates if c.driver.id == route.driver_id), None)
        if candidate and candidate.driver.safety_status == SafetyStatus.WARNING:
            drivers_with_warnings += 1

    return ConfidenceInputs(
        order_geocode_confidences=geocode_confidences,
        warning_count=len(validation.warnings),
        max_weight_utilisation=max(weight_utils),
        max_volume_utilisation=max(volume_utils),
        max_shift_utilisation=max(shift_utils),
        mean_window_slack_fraction=sum(slacks) / len(slacks) if slacks else 1.0,
        assigned_order_count=sum(len(r.stops) for r in solution.routes),
        unassigned_order_count=len(solution.dropped_order_ids),
        matrix_completeness=problem.matrix.completeness,
        matrix_fallback_fraction=problem.matrix.fallback_fraction,
        solver_status=solution.status,
        drivers_with_safety_warnings=drivers_with_warnings,
        drivers_total=len(solution.routes),
    )


def _persist_plan(
    session: Session,
    org: m.Organisation,
    rules: OperatingRules,
    problem: SolverInput,
    solution: SolverOutput,
    validation: PlanValidationResult,
    confidence: ConfidenceBreakdown | None,
    order_by_id: dict[str, m.Order],
    candidates,
    planning_date: datetime,
    reason: str | None,
    previous_plan_id: str | None,
) -> PlanResult:
    if not validation.is_valid or confidence is None:
        status = PlanStatus.FAILED
    elif confidence.level == DecisionLevel.AUTO_PUBLISH and rules.approval.auto_dispatch_enabled:
        status = PlanStatus.PUBLISHED
    elif confidence.level == DecisionLevel.MANUAL_INTERVENTION:
        status = PlanStatus.DRAFT
    else:
        status = PlanStatus.PENDING_APPROVAL

    total_distance_km = sum(r.distance_m for r in solution.routes) / 1000
    total_duration_min = sum(r.duration_s for r in solution.routes) / 60

    plan = m.DispatchPlan(
        organisation_id=org.id,
        planning_date=planning_date,
        status=status,
        confidence_score=confidence.score if confidence else None,
        total_distance=round(total_distance_km, 2),
        total_duration=round(total_duration_min, 1),
        total_cost=(solution.objective_value or 0) / 100 if solution.objective_value else None,
        solver_status=solution.status,
        previous_plan_id=previous_plan_id,
        reason=reason,
        approved_at=m.utc_now() if status == PlanStatus.PUBLISHED else None,
    )
    PlanRepo.save(session, plan)

    routes: list[m.Route] = []
    stops_by_route: dict[str, list[m.RouteStop]] = {}
    depot = rules.depots[0]
    persist_routes = status != PlanStatus.FAILED
    if persist_routes:
        for vroute in solution.routes:
            route, stops = _persist_route(session, plan, vroute, problem, depot)
            routes.append(route)
            stops_by_route[route.id] = stops
            _audit_assignment(session, org.id, plan.id, route, vroute, problem, candidates, depot)
        if status == PlanStatus.PUBLISHED:
            _mark_orders_assigned(session, org.id, plan.id)

    _audit_plan_creation(session, org, rules, plan, problem, solution, validation, confidence)
    session.flush()

    return PlanResult(
        plan=plan,
        routes=routes,
        stops=stops_by_route,
        validation=validation,
        confidence=confidence,
        solution=solution,
        unassigned_order_ids=list(solution.dropped_order_ids),
    )


def _persist_route(
    session: Session,
    plan: m.DispatchPlan,
    vroute: VehicleRoute,
    problem: SolverInput,
    depot: Coordinate,
) -> tuple[m.Route, list[m.RouteStop]]:
    spec = next(
        s for s in problem.vehicles
        if s.driver_id == vroute.driver_id and s.vehicle_id == vroute.vehicle_id
    )
    route = m.Route(
        plan_id=plan.id,
        driver_id=vroute.driver_id,
        vehicle_id=vroute.vehicle_id,
        status=RouteStatus.PLANNED,
        start_location=m.Location(latitude=depot.latitude, longitude=depot.longitude, label="depot"),
        end_location=m.Location(latitude=depot.latitude, longitude=depot.longitude, label="depot"),
        estimated_distance=round(vroute.distance_m / 1000, 2),
        estimated_duration=round(vroute.duration_s / 60, 1),
        capacity_usage={
            "weight_kg": vroute.load_weight_g / 1000,
            "volume_m3": vroute.load_volume_ml / 1_000_000,
            "weight_utilisation": round(vroute.load_weight_g / spec.weight_capacity_g, 3),
            "volume_utilisation": round(vroute.load_volume_ml / spec.volume_capacity_ml, 3),
        },
    )
    PlanRepo.save_route(session, route)

    stops: list[m.RouteStop] = []
    for position, stop in enumerate(vroute.stops, start=1):
        record = m.RouteStop(
            route_id=route.id,
            order_id=stop.order_id,
            sequence_number=position,
            estimated_arrival=problem.horizon_start + timedelta(seconds=stop.arrival_s),
            estimated_departure=problem.horizon_start + timedelta(seconds=stop.departure_s),
            status=StopStatus.PENDING,
        )
        PlanRepo.save_stop(session, record)
        stops.append(record)
    return route, stops


def _audit_assignment(session, org_id, plan_id, route, vroute, problem, candidates, depot) -> None:
    candidate = next((c for c in candidates if c.driver.id == route.driver_id), None)
    if candidate is None:
        return
    explanation = explain_assignment(
        route.id,
        candidate,
        route_start=depot,
        route_duration_minutes=vroute.duration_s / 60,
        route_weight_kg=vroute.load_weight_g / 1000,
        route_volume_m3=vroute.load_volume_ml / 1_000_000,
        rejected=[],
    )
    record_decision(
        session, org_id, DecisionType.ASSIGNMENT,
        " ".join(explanation["reasons"]),
        plan_id=plan_id,
        decision_result=explanation,
    )


def _audit_plan_creation(session, org, rules, plan, problem, solution, validation, confidence) -> None:
    rules_applied = [
        applied_rule("objective_weights", rules.weights.model_dump(mode="json")),
        applied_rule("max_overtime_minutes", rules.max_overtime_minutes),
        applied_rule("allowed_late_minutes", rules.allowed_late_minutes),
        applied_rule("auto_dispatch_enabled", rules.approval.auto_dispatch_enabled),
        applied_rule("auto_publish_threshold", rules.approval.auto_publish_threshold),
        applied_rule("approval_threshold", rules.approval.approval_threshold),
    ]
    lines = [
        f"Plan {plan.id} created with status '{plan.status}'.",
        f"Solver status '{solution.status}' in {solution.solver_wall_time_s}s; "
        f"{len(solution.routes)} route(s), {len(solution.dropped_order_ids)} unassigned order(s).",
    ]
    if validation.errors:
        lines.append("Validation errors: " + "; ".join(e.message for e in validation.errors))
    if validation.warnings:
        lines.append("Validation warnings: " + "; ".join(w.message for w in validation.warnings))
    if confidence is not None:
        lines.extend(confidence.explanation_lines())
    record_decision(
        session, org.id, DecisionType.PLAN_CREATED,
        "\n".join(lines),
        plan_id=plan.id,
        input_snapshot={
            "order_ids": [o.order_id for o in problem.orders],
            "vehicle_pairs": [
                {"driver_id": s.driver_id, "vehicle_id": s.vehicle_id} for s in problem.vehicles
            ],
            "matrix_provider": problem.matrix.provider,
            "matrix_fallback_fraction": problem.matrix.fallback_fraction,
        },
        rules_applied=rules_applied,
        decision_result={
            "status": str(plan.status),
            "confidence": confidence.score if confidence else None,
            "confidence_level": str(confidence.level) if confidence else None,
            "validation_errors": [e.model_dump() for e in validation.errors],
            "validation_warnings": [w.model_dump() for w in validation.warnings],
            "unassigned_order_ids": solution.dropped_order_ids,
            "reassigned_order_ids": solution.reassigned_order_ids,
        },
    )
    logger.info(
        "plan created",
        extra=log_ctx(plan_id=plan.id, status=str(plan.status),
                      confidence=confidence.score if confidence else None),
    )


def _mark_orders_assigned(session: Session, organisation_id: str, plan_id: str) -> None:
    for order_id in _plan_order_ids(session, plan_id):
        order = OrderRepo.get(session, organisation_id, order_id)
        if order is not None:
            order.status = OrderStatus.ASSIGNED
            OrderRepo.save(session, order)


def _release_plan_orders(session: Session, organisation_id: str, plan_id: str) -> None:
    for order_id in _plan_order_ids(session, plan_id):
        order = OrderRepo.get(session, organisation_id, order_id)
        if order is not None and order.status == OrderStatus.ASSIGNED:
            order.status = OrderStatus.READY
            OrderRepo.save(session, order)


def _plan_order_ids(session: Session, plan_id: str) -> list[str]:
    from sqlalchemy import select

    from aiviate.db import tables as t

    rows = session.execute(
        select(t.RouteStopRow.order_id)
        .join(t.RouteRow, t.RouteStopRow.route_id == t.RouteRow.id)
        .where(t.RouteRow.plan_id == plan_id)
    )
    return [r[0] for r in rows]

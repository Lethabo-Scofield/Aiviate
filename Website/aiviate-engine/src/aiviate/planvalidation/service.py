"""Independent plan validation.

Re-derives every constraint from first principles using the solver *input*
(orders, vehicle specs, matrix, rules) and the solver *output* — it shares no
code with the solver's constraint setup, so a solver bug or a mis-built model
cannot silently publish an invalid plan.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from aiviate.domain.enums import DriverStatus, SafetyStatus, VehicleStatus
from aiviate.domain.models import Driver, Vehicle
from aiviate.observability import get_logger, log_ctx
from aiviate.solver.model import SolverInput, SolverOutput

logger = get_logger(__name__)


class PlanIssue(BaseModel):
    code: str
    message: str
    route_index: int | None = None
    order_id: str | None = None


class PlanValidationResult(BaseModel):
    errors: list[PlanIssue] = Field(default_factory=list)
    warnings: list[PlanIssue] = Field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.errors

    def error(self, code: str, message: str, **kw) -> None:
        self.errors.append(PlanIssue(code=code, message=message, **kw))

    def warn(self, code: str, message: str, **kw) -> None:
        self.warnings.append(PlanIssue(code=code, message=message, **kw))


def validate_solution(
    problem: SolverInput,
    solution: SolverOutput,
    drivers: dict[str, Driver],
    vehicles: dict[str, Vehicle],
    organisation_id: str,
) -> PlanValidationResult:
    result = PlanValidationResult()
    orders_by_id = {o.order_id: o for o in problem.orders}
    specs_by_pair = {(s.driver_id, s.vehicle_id): s for s in problem.vehicles}

    seen_orders: dict[str, int] = {}
    seen_drivers: dict[str, int] = {}
    seen_vehicles: dict[str, int] = {}

    for route in solution.routes:
        r = route.vehicle_index

        # One driver and one vehicle, known to the problem and the organisation.
        spec = specs_by_pair.get((route.driver_id, route.vehicle_id))
        if spec is None:
            result.error("UNKNOWN_PAIR", "Route uses a driver/vehicle pair not offered to the solver.",
                         route_index=r)
            continue
        driver = drivers.get(route.driver_id)
        vehicle = vehicles.get(route.vehicle_id)
        if driver is None or driver.organisation_id != organisation_id:
            result.error("FOREIGN_DRIVER", "Route driver does not belong to the organisation.",
                         route_index=r)
            continue
        if vehicle is None or vehicle.organisation_id != organisation_id:
            result.error("FOREIGN_VEHICLE", "Route vehicle does not belong to the organisation.",
                         route_index=r)
            continue

        # Overlapping-route checks (a resource may appear on at most one route).
        if route.driver_id in seen_drivers:
            result.error("DRIVER_OVERLAP",
                         f"Driver {route.driver_id} appears on routes "
                         f"{seen_drivers[route.driver_id]} and {r}.", route_index=r)
        seen_drivers[route.driver_id] = r
        if route.vehicle_id in seen_vehicles:
            result.error("VEHICLE_OVERLAP",
                         f"Vehicle {route.vehicle_id} appears on routes "
                         f"{seen_vehicles[route.vehicle_id]} and {r}.", route_index=r)
        seen_vehicles[route.vehicle_id] = r

        # Availability and safety at publication time.
        if driver.status not in {DriverStatus.AVAILABLE, DriverStatus.ON_ROUTE}:
            result.error("DRIVER_UNAVAILABLE", f"Driver status is '{driver.status}'.", route_index=r)
        if driver.safety_status == SafetyStatus.BLOCKED or driver.safety_status == SafetyStatus.BREAK_REQUIRED:
            result.error("DRIVER_SAFETY_BLOCKED",
                         f"Driver safety status '{driver.safety_status}' forbids new routes.",
                         route_index=r)
        if vehicle.status not in {VehicleStatus.AVAILABLE, VehicleStatus.IN_USE}:
            result.error("VEHICLE_UNAVAILABLE", f"Vehicle status is '{vehicle.status}'.", route_index=r)

        # Capacity, recomputed from order data.
        total_weight = sum(orders_by_id[s.order_id].weight_g for s in route.stops
                           if s.order_id in orders_by_id)
        total_volume = sum(orders_by_id[s.order_id].volume_ml for s in route.stops
                           if s.order_id in orders_by_id)
        if total_weight > spec.weight_capacity_g:
            result.error("WEIGHT_EXCEEDED",
                         f"Route load {total_weight} g exceeds capacity {spec.weight_capacity_g} g.",
                         route_index=r)
        if total_volume > spec.volume_capacity_ml:
            result.error("VOLUME_EXCEEDED",
                         f"Route load {total_volume} ml exceeds capacity {spec.volume_capacity_ml} ml.",
                         route_index=r)

        _check_stops(problem, route, spec, orders_by_id, seen_orders, result)

    # Global order accounting: every input order is either assigned exactly
    # once (duplicates already recorded in _check_stops) or reported dropped.
    unaccounted = set(orders_by_id) - set(seen_orders) - set(solution.dropped_order_ids)
    for order_id in unaccounted:
        result.error("ORDER_UNACCOUNTED", f"Order {order_id} neither assigned nor reported dropped.",
                     order_id=order_id)

    if not result.is_valid:
        logger.warning(
            "plan validation failed",
            extra=log_ctx(errors=[e.code for e in result.errors]),
        )
    return result


def _check_stops(problem, route, spec, orders_by_id, seen_orders, result) -> None:
    r = route.vehicle_index
    matrix = problem.matrix
    previous_point = spec.start_point
    previous_departure = spec.shift_start_s

    for position, stop in enumerate(route.stops):
        order = orders_by_id.get(stop.order_id)
        if order is None:
            result.error("UNKNOWN_ORDER", f"Stop references unknown order {stop.order_id}.",
                         route_index=r, order_id=stop.order_id)
            continue
        if stop.order_id in seen_orders:
            result.error("DUPLICATE_ORDER",
                         f"Order {stop.order_id} assigned to routes "
                         f"{seen_orders[stop.order_id]} and {r}.",
                         route_index=r, order_id=stop.order_id)
            continue
        seen_orders[stop.order_id] = r

        # Time-window compliance (hard bound; inside the grace is a warning).
        hard_end = order.window_end_s + order.allowed_late_s
        if stop.arrival_s < order.window_start_s or stop.arrival_s > hard_end:
            result.error("WINDOW_VIOLATED",
                         f"Arrival {stop.arrival_s}s outside window "
                         f"[{order.window_start_s}, {hard_end}]s.",
                         route_index=r, order_id=stop.order_id)
        elif stop.arrival_s > order.window_end_s:
            result.warn("LATE_WITHIN_GRACE",
                        f"Arrival {stop.arrival_s - order.window_end_s}s past the window end "
                        "but inside the allowed grace.",
                        route_index=r, order_id=stop.order_id)

        # Estimated-time consistency: arrivals must respect travel + service.
        earliest = previous_departure + round(matrix.duration_s(previous_point, order.point))
        if stop.arrival_s + 1 < earliest:  # 1s tolerance for rounding
            result.error("TIME_INCONSISTENT",
                         f"Arrival {stop.arrival_s}s earlier than reachable ({earliest}s).",
                         route_index=r, order_id=stop.order_id)
        if stop.departure_s < stop.arrival_s + order.service_time_s:
            result.error("SERVICE_TIME_MISSING",
                         "Departure does not include the order's service time.",
                         route_index=r, order_id=stop.order_id)
        previous_point = order.point
        previous_departure = stop.departure_s

    # Shift compliance including the leg back to the end location.
    if route.stops:
        return_arrival = previous_departure + round(matrix.duration_s(previous_point, spec.end_point))
        hard_shift_end = spec.shift_end_s + spec.max_overtime_s
        if return_arrival > hard_shift_end:
            result.error("SHIFT_EXCEEDED",
                         f"Route ends at {return_arrival}s, after the hard shift limit "
                         f"{hard_shift_end}s.", route_index=r)
        elif return_arrival > spec.shift_end_s:
            result.warn("OVERTIME", f"Route ends {return_arrival - spec.shift_end_s}s into overtime.",
                        route_index=r)

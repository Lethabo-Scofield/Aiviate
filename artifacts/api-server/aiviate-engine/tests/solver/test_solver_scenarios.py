"""Solver scenarios required by the specification."""

from aiviate.domain.enums import OrderPriority, SolverStatus
from aiviate.solver import solve
from tests.solver.helpers import (
    DEPOT,
    H,
    JOBURG_CENTRE,
    PRETORIA_CENTRE,
    SOWETO_CENTRE,
    order_node,
    problem,
    spread,
    vehicle_spec,
)


def test_one_driver_several_orders():
    points = [DEPOT] + spread(JOBURG_CENTRE, 6)
    orders = [order_node(f"ORD-{i}", i + 1) for i in range(6)]
    result = solve(problem([vehicle_spec(1)], orders, points))

    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert len(result.routes) == 1
    assert result.dropped_order_ids == []
    assert [s.order_id for s in result.routes[0].stops].__len__() == 6
    # Arrivals strictly ordered and include service time.
    stops = result.routes[0].stops
    for a, b in zip(stops, stops[1:]):
        assert b.arrival_s >= a.departure_s


def test_three_drivers_three_areas():
    points = [DEPOT] + spread(JOBURG_CENTRE, 4) + spread(SOWETO_CENTRE, 4) + spread(PRETORIA_CENTRE, 4)
    orders = [order_node(f"ORD-{i}", i + 1) for i in range(12)]
    vehicles = [vehicle_spec(i) for i in range(1, 4)]
    result = solve(problem(vehicles, orders, points))

    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert result.dropped_order_ids == []
    assert len(result.routes) == 3
    # Geographic sanity: no order should be served by a route that also
    # serves an order 3+ areas away if a dedicated vehicle exists — checked
    # loosely via total distance staying well below the naive worst case.
    total_km = sum(r.distance_m for r in result.routes) / 1000
    assert total_km < 400


def test_more_orders_than_capacity_drops_lowest_priority():
    points = [DEPOT] + spread(JOBURG_CENTRE, 8)
    # One small vehicle: fits only 4 x 100kg.
    vehicles = [vehicle_spec(1, weight_kg=400)]
    orders = [
        order_node(
            f"ORD-{i}",
            i + 1,
            weight_kg=100,
            priority=OrderPriority.URGENT if i < 2 else OrderPriority.LOW,
        )
        for i in range(8)
    ]
    result = solve(problem(vehicles, orders, points))

    assert result.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert len(result.dropped_order_ids) == 4
    # Urgent orders carry 12x the drop penalty of low priority — they stay.
    assert "ORD-0" not in result.dropped_order_ids
    assert "ORD-1" not in result.dropped_order_ids
    carried = sum(o.weight_g for r in result.routes for s in r.stops
                  for o in [next(o for o in orders if o.order_id == s.order_id)])
    assert carried <= 400_000


def test_impossible_delivery_windows_dropped_not_violated():
    points = [DEPOT] + spread(JOBURG_CENTRE, 2)
    orders = [
        order_node("ORD-OK", 1),
        # Window closes before any driver shift starts (shift starts at 1H).
        order_node("ORD-IMPOSSIBLE", 2, window=(0, 1800)),
    ]
    result = solve(problem([vehicle_spec(1)], orders, points))

    assert "ORD-IMPOSSIBLE" in result.dropped_order_ids
    assert "ORD-OK" not in result.dropped_order_ids


def test_no_vehicles_is_infeasible():
    points = [DEPOT] + spread(JOBURG_CENTRE, 2)
    orders = [order_node("ORD-1", 1), order_node("ORD-2", 2)]
    result = solve(problem([], orders, points))
    assert result.status == SolverStatus.INFEASIBLE
    assert set(result.dropped_order_ids) == {"ORD-1", "ORD-2"}


def test_no_feasible_solution_reports_all_dropped():
    points = [DEPOT] + spread(PRETORIA_CENTRE, 2)
    # Shift so short nothing is reachable: 60 seconds.
    vehicles = [vehicle_spec(1, shift_start_s=1 * H, shift_end_s=1 * H + 60, max_overtime_s=0)]
    orders = [order_node("ORD-1", 1), order_node("ORD-2", 2)]
    result = solve(problem(vehicles, orders, points))
    # Solver drops everything rather than violating shift constraints.
    assert set(result.dropped_order_ids) == {"ORD-1", "ORD-2"}
    assert result.routes == []


def test_locked_vehicle_respected_for_reoptimisation():
    points = [DEPOT] + spread(JOBURG_CENTRE, 4)
    vehicles = [vehicle_spec(1), vehicle_spec(2)]
    orders = [
        order_node("ORD-LOCKED", 1, allowed_vehicles=[1]),
        order_node("ORD-A", 2),
        order_node("ORD-B", 3),
        order_node("ORD-C", 4),
    ]
    result = solve(problem(vehicles, orders, points))

    lock_route = next(r for r in result.routes if any(s.order_id == "ORD-LOCKED" for s in r.stops))
    assert lock_route.vehicle_index == 1


def test_previous_assignment_reassignments_counted():
    points = [DEPOT] + spread(JOBURG_CENTRE, 3)
    vehicles = [vehicle_spec(1)]
    orders = [order_node(f"ORD-{i}", i + 1) for i in range(3)]
    previous = {"ORD-0": 5, "ORD-1": 0, "ORD-2": 0}  # ORD-0 was on another vehicle
    result = solve(problem(vehicles, orders, points, previous_assignment=previous))
    assert result.reassigned_order_ids == ["ORD-0"]


def test_time_windows_and_shift_are_hard_constraints():
    points = [DEPOT] + spread(JOBURG_CENTRE, 5)
    vehicles = [vehicle_spec(1)]
    orders = [order_node(f"ORD-{i}", i + 1, window=(2 * H, 3 * H)) for i in range(5)]
    result = solve(problem(vehicles, orders, points))
    for route in result.routes:
        for stop in route.stops:
            assert 2 * H <= stop.arrival_s <= 3 * H
        assert route.overtime_s <= 3600

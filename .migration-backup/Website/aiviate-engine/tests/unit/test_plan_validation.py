"""Plan validation must catch corrupt solver output regardless of solver status."""

from aiviate.domain.enums import SolverStatus
from aiviate.planvalidation import validate_solution
from aiviate.solver import solve
from aiviate.solver.model import SolverOutput, StopEstimate, VehicleRoute
from tests.conftest import make_driver, make_vehicle
from tests.solver.helpers import DEPOT, JOBURG_CENTRE, order_node, problem, spread, vehicle_spec

ORG = "org-1"


def _entities(n=2):
    drivers, vehicles = {}, {}
    for i in range(1, n + 1):
        driver = make_driver(ORG, f"Driver {i}", -26.1, 28.0)
        driver.id = f"DRV-{i:02d}"
        vehicle = make_vehicle(ORG, f"REG-{i}")
        vehicle.id = f"VEH-{i:02d}"
        drivers[driver.id] = driver
        vehicles[vehicle.id] = vehicle
    return drivers, vehicles


def _valid_problem_and_solution():
    points = [DEPOT] + spread(JOBURG_CENTRE, 4)
    orders = [order_node(f"ORD-{i}", i + 1) for i in range(4)]
    prob = problem([vehicle_spec(1), vehicle_spec(2)], orders, points)
    return prob, solve(prob)


def test_valid_solution_passes():
    prob, solution = _valid_problem_and_solution()
    drivers, vehicles = _entities()
    result = validate_solution(prob, solution, drivers, vehicles, ORG)
    assert result.is_valid, [e.model_dump() for e in result.errors]


def test_duplicate_order_detected():
    prob, solution = _valid_problem_and_solution()
    drivers, vehicles = _entities()
    # Corrupt: copy the first stop onto the other route.
    victim = solution.routes[0].stops[0]
    corrupted = solution.model_copy(deep=True)
    if len(corrupted.routes) > 1:
        corrupted.routes[1].stops.append(victim.model_copy())
    else:
        corrupted.routes[0].stops.append(victim.model_copy())
    result = validate_solution(prob, corrupted, drivers, vehicles, ORG)
    assert any(e.code == "DUPLICATE_ORDER" for e in result.errors)


def test_capacity_violation_detected():
    points = [DEPOT] + spread(JOBURG_CENTRE, 2)
    orders = [order_node("ORD-0", 1, weight_kg=300), order_node("ORD-1", 2, weight_kg=300)]
    prob = problem([vehicle_spec(1, weight_kg=400)], orders, points)
    # Forged solution claiming both fit.
    forged = SolverOutput(
        status=SolverStatus.OPTIMAL,
        routes=[
            VehicleRoute(
                vehicle_index=0, driver_id="DRV-01", vehicle_id="VEH-01",
                stops=[
                    StopEstimate(order_id="ORD-0", arrival_s=8000, departure_s=8300),
                    StopEstimate(order_id="ORD-1", arrival_s=9500, departure_s=9800),
                ],
            )
        ],
    )
    drivers, vehicles = _entities(1)
    result = validate_solution(prob, forged, drivers, vehicles, ORG)
    assert any(e.code == "WEIGHT_EXCEEDED" for e in result.errors)


def test_window_violation_detected():
    prob, solution = _valid_problem_and_solution()
    drivers, vehicles = _entities()
    corrupted = solution.model_copy(deep=True)
    corrupted.routes[0].stops[0].arrival_s = 1  # long before any window opens
    result = validate_solution(prob, corrupted, drivers, vehicles, ORG)
    assert any(e.code in {"WINDOW_VIOLATED", "TIME_INCONSISTENT"} for e in result.errors)


def test_foreign_driver_detected():
    prob, solution = _valid_problem_and_solution()
    drivers, vehicles = _entities()
    for driver in drivers.values():
        driver.organisation_id = "someone-else"
    result = validate_solution(prob, solution, drivers, vehicles, ORG)
    assert any(e.code == "FOREIGN_DRIVER" for e in result.errors)


def test_unaccounted_order_detected():
    prob, solution = _valid_problem_and_solution()
    drivers, vehicles = _entities()
    corrupted = solution.model_copy(deep=True)
    removed = corrupted.routes[0].stops.pop()
    assert removed.order_id not in corrupted.dropped_order_ids
    result = validate_solution(prob, corrupted, drivers, vehicles, ORG)
    assert any(e.code == "ORDER_UNACCOUNTED" for e in result.errors)


def test_blocked_driver_fails_validation_even_if_solver_used_them():
    prob, solution = _valid_problem_and_solution()
    drivers, vehicles = _entities()
    from aiviate.domain.enums import SafetyStatus

    for driver in drivers.values():
        driver.safety_status = SafetyStatus.BLOCKED
    result = validate_solution(prob, solution, drivers, vehicles, ORG)
    assert any(e.code == "DRIVER_SAFETY_BLOCKED" for e in result.errors)

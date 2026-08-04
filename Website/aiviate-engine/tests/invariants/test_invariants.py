"""Property/invariant tests over randomised (seeded) scenarios.

For a range of fleet sizes, order mixes and capacities:
* an order is never assigned twice
* vehicle capacity is never exceeded
* drivers never receive overlapping routes
* completed stops are never moved by re-optimisation
* invalid plans are never published
"""

import random

import pytest

from aiviate.domain.enums import OrderPriority, PlanStatus
from aiviate.planvalidation import validate_solution
from aiviate.solver import solve
from tests.conftest import make_driver, make_vehicle
from tests.solver.helpers import (
    DEPOT,
    H,
    JOBURG_CENTRE,
    PRETORIA_CENTRE,
    SOWETO_CENTRE,
    order_node,
    problem,
    vehicle_spec,
)

CENTRES = [JOBURG_CENTRE, SOWETO_CENTRE, PRETORIA_CENTRE]


def random_scenario(seed: int):
    rng = random.Random(seed)
    n_vehicles = rng.randint(1, 4)
    vehicles = [
        vehicle_spec(i + 1, weight_kg=rng.choice([250, 400, 800]),
                     volume_m3=rng.choice([2.0, 4.0, 6.0]))
        for i in range(n_vehicles)
    ]
    n_orders = rng.randint(5, 22)
    points = [DEPOT]
    orders = []
    for i in range(n_orders):
        centre = rng.choice(CENTRES)
        from aiviate.domain.geo import Coordinate

        points.append(Coordinate(
            latitude=centre.latitude + rng.uniform(-0.04, 0.04),
            longitude=centre.longitude + rng.uniform(-0.04, 0.04),
        ))
        start = rng.choice([2 * H, 3 * H, 4 * H])
        orders.append(order_node(
            f"ORD-{seed}-{i}", i + 1,
            weight_kg=rng.uniform(5, 120),
            volume_m3=rng.uniform(0.05, 0.8),
            window=(start, start + rng.choice([3 * H, 5 * H, 7 * H])),
            priority=rng.choice(list(OrderPriority)),
        ))
    return problem(vehicles, orders, points, time_limit_seconds=2)


@pytest.mark.parametrize("seed", range(8))
def test_solver_invariants_hold(seed):
    prob = random_scenario(seed)
    solution = solve(prob)

    # 1. Never assigned twice — and dropped+assigned accounts for every order.
    assigned = [s.order_id for r in solution.routes for s in r.stops]
    assert len(assigned) == len(set(assigned))
    assert set(assigned) | set(solution.dropped_order_ids) == {o.order_id for o in prob.orders}
    assert not set(assigned) & set(solution.dropped_order_ids)

    # 2. Capacity never exceeded (recomputed from order data, not route fields).
    orders_by_id = {o.order_id: o for o in prob.orders}
    for route in solution.routes:
        spec = next(s for s in prob.vehicles
                    if s.driver_id == route.driver_id and s.vehicle_id == route.vehicle_id)
        assert sum(orders_by_id[s.order_id].weight_g for s in route.stops) <= spec.weight_capacity_g
        assert sum(orders_by_id[s.order_id].volume_ml for s in route.stops) <= spec.volume_capacity_ml

    # 3. No driver or vehicle appears on two routes.
    drivers = [r.driver_id for r in solution.routes]
    vehicles = [r.vehicle_id for r in solution.routes]
    assert len(drivers) == len(set(drivers))
    assert len(vehicles) == len(set(vehicles))

    # Cross-check with the independent validator.
    driver_entities = {
        s.driver_id: make_driver("org-1", s.driver_id, DEPOT.latitude, DEPOT.longitude)
        for s in prob.vehicles
    }
    vehicle_entities = {
        s.vehicle_id: make_vehicle("org-1", s.vehicle_id,
                                   maximum_weight=s.weight_capacity_g / 1000,
                                   maximum_volume=s.volume_capacity_ml / 1_000_000)
        for s in prob.vehicles
    }
    for driver_id, entity in driver_entities.items():
        entity.id = driver_id
    for vehicle_id, entity in vehicle_entities.items():
        entity.id = vehicle_id
    validation = validate_solution(prob, solution, driver_entities, vehicle_entities, "org-1")
    assert validation.is_valid, [e.model_dump() for e in validation.errors]


@pytest.mark.parametrize("seed", range(4))
def test_locked_orders_never_move(seed):
    """Locks (the mechanism preserving active stops in re-optimisation) hold."""
    prob = random_scenario(seed)
    if len(prob.vehicles) < 2:
        pytest.skip("needs two vehicles to be meaningful")
    lock_vehicle = seed % len(prob.vehicles)
    locked = [o.order_id for o in prob.orders[:3]]
    for node in prob.orders[:3]:
        node.allowed_vehicles = [lock_vehicle]
    solution = solve(prob)
    for route in solution.routes:
        for stop in route.stops:
            if stop.order_id in locked:
                assert route.vehicle_index == lock_vehicle


def test_invalid_plans_are_never_published(session, organisation):
    """Even a 'successful' solve is not published when validation fails."""
    from datetime import datetime
    from unittest.mock import patch

    from aiviate.db.repo import DriverRepo, OrderRepo, VehicleRepo
    from aiviate.engine import create_plan
    from aiviate.matrix import MatrixService
    from aiviate.matrix.haversine import HaversineFallbackProvider
    from aiviate.solver.model import SolverOutput, StopEstimate, VehicleRoute
    from tests.conftest import make_order

    driver = make_driver(organisation.id, "D1", -26.14, 28.04)
    vehicle = make_vehicle(organisation.id, "V1")
    driver.assigned_vehicle_id = vehicle.id
    DriverRepo.save(session, driver)
    VehicleRepo.save(session, vehicle)
    order = make_order(organisation.id, "ORD-X", -26.2, 28.0)
    OrderRepo.save(session, order)
    session.commit()

    def corrupt_solve(prob):
        # Claims success but duplicates the order on the same route.
        stop = StopEstimate(order_id=order.id, arrival_s=8000, departure_s=8300)
        return SolverOutput(
            status="optimal",
            routes=[VehicleRoute(vehicle_index=0, driver_id=driver.id, vehicle_id=vehicle.id,
                                 stops=[stop, stop.model_copy()])],
        )

    with patch("aiviate.engine.solve", side_effect=corrupt_solve):
        result = create_plan(session, MatrixService(HaversineFallbackProvider()),
                             organisation.id, datetime(2026, 7, 6))
    assert not result.validation.is_valid
    assert result.plan.status == PlanStatus.FAILED
    assert result.plan.status not in (PlanStatus.PUBLISHED, PlanStatus.PENDING_APPROVAL)

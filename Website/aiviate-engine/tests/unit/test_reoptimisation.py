"""Re-optimisation: breakdown handling, stop preservation, diff reports."""

import pytest

from aiviate.db.repo import DriverRepo, OrderRepo, PlanRepo, VehicleRepo
from aiviate.domain.enums import (
    OrderStatus,
    PlanStatus,
    RouteStatus,
    StopStatus,
    VehicleStatus,
)
from aiviate.engine import approve_plan, create_plan
from aiviate.matrix import MatrixService
from aiviate.matrix.haversine import HaversineFallbackProvider
from aiviate.notifications import LoggingNotifier
from aiviate.reoptimization import reoptimise_plan
from aiviate.reoptimization.controller import ReoptimisationTrigger
from tests.conftest import PLANNING_DAY, make_driver, make_order, make_vehicle
from tests.solver.helpers import JOBURG_CENTRE, PRETORIA_CENTRE, SOWETO_CENTRE, spread


def matrix_service() -> MatrixService:
    return MatrixService(HaversineFallbackProvider())


@pytest.fixture()
def published_plan(session, organisation):
    """Three drivers/vehicles, 12 orders across three areas, plan published."""
    drivers, vehicles = [], []
    for i in range(1, 4):
        driver = make_driver(organisation.id, f"Driver {i}", -26.14, 28.04)
        vehicle = make_vehicle(organisation.id, f"REG-{i:03d}")
        driver.assigned_vehicle_id = vehicle.id
        DriverRepo.save(session, driver)
        VehicleRepo.save(session, vehicle)
        drivers.append(driver)
        vehicles.append(vehicle)
    n = 0
    for centre in (JOBURG_CENTRE, SOWETO_CENTRE, PRETORIA_CENTRE):
        for point in spread(centre, 4):
            n += 1
            OrderRepo.save(session, make_order(organisation.id, f"ORD-{n:03d}",
                                               point.latitude, point.longitude))
    session.commit()
    result = create_plan(session, matrix_service(), organisation.id, PLANNING_DAY,
                         time_limit_seconds=3)
    approve_plan(session, organisation.id, result.plan.id, actor="admin")
    session.commit()
    return result, drivers, vehicles


def test_breakdown_reassigns_open_orders_and_preserves_completed(session, organisation,
                                                                 published_plan):
    result, drivers, vehicles = published_plan
    # Pick the busiest route; complete its first stop; driver is mid-route.
    victim_route = max(result.routes, key=lambda r: len(result.stops[r.id]))
    victim_stops = result.stops[victim_route.id]
    completed_stop = victim_stops[0]
    completed_stop.status = StopStatus.COMPLETED
    PlanRepo.save_stop(session, completed_stop)
    completed_order = OrderRepo.get(session, organisation.id, completed_stop.order_id)
    completed_order.status = OrderStatus.DELIVERED
    OrderRepo.save(session, completed_order)
    victim_route.status = RouteStatus.ACTIVE
    PlanRepo.save_route(session, victim_route)
    broken_vehicle = next(v for v in vehicles if v.id == victim_route.vehicle_id)
    broken_vehicle.status = VehicleStatus.BREAKDOWN
    VehicleRepo.save(session, broken_vehicle)
    session.commit()

    outcome = reoptimise_plan(
        session, matrix_service(), organisation.id, result.plan.id,
        ReoptimisationTrigger(reason="VEHICLE_BREAKDOWN", vehicle_id=broken_vehicle.id,
                              interrupt_active_stop=True, delay_minutes=25),
        time_limit_seconds=3,
    )
    session.commit()

    new_assignment = {
        stop.order_id: route.driver_id
        for route in outcome.new_plan.routes
        for stop in outcome.new_plan.stops[route.id]
    }
    # Completed stop never re-planned and never moved.
    assert completed_stop.order_id not in new_assignment
    persisted = PlanRepo.stops(session, victim_route.id)
    assert persisted[0].order_id == completed_stop.order_id
    assert persisted[0].status == StopStatus.COMPLETED
    assert persisted[0].sequence_number == completed_stop.sequence_number

    # The broken vehicle is nowhere in the new plan.
    assert all(r.vehicle_id != broken_vehicle.id for r in outcome.new_plan.routes)

    # Diff report shape.
    diff = outcome.diff
    assert diff["reason"] == "VEHICLE_BREAKDOWN"
    assert diff["previous_plan_id"] == result.plan.id
    assert diff["new_plan_id"] == outcome.new_plan.plan.id
    assert diff["reassigned_orders"] >= 1
    assert diff["estimated_delay_minutes"] == 25
    assert victim_route.driver_id in diff["affected_drivers"]


def test_unaffected_drivers_keep_their_orders(session, organisation, published_plan):
    result, drivers, vehicles = published_plan
    victim_route = result.routes[0]
    previous = {
        stop.order_id: route.driver_id
        for route in result.routes
        for stop in result.stops[route.id]
    }
    broken_vehicle = next(v for v in vehicles if v.id == victim_route.vehicle_id)
    broken_vehicle.status = VehicleStatus.BREAKDOWN
    VehicleRepo.save(session, broken_vehicle)
    session.commit()

    outcome = reoptimise_plan(
        session, matrix_service(), organisation.id, result.plan.id,
        ReoptimisationTrigger(reason="VEHICLE_BREAKDOWN", vehicle_id=broken_vehicle.id),
        time_limit_seconds=3,
    )
    new_assignment = {
        stop.order_id: route.driver_id
        for route in outcome.new_plan.routes
        for stop in outcome.new_plan.stops[route.id]
    }
    for order_id, driver_id in previous.items():
        if driver_id != victim_route.driver_id and order_id in new_assignment:
            assert new_assignment[order_id] == driver_id, "unaffected driver was changed"


def test_significant_change_requires_approval(session, organisation, published_plan):
    result, drivers, vehicles = published_plan
    broken = next(v for v in vehicles if v.id == result.routes[0].vehicle_id)
    broken.status = VehicleStatus.BREAKDOWN
    VehicleRepo.save(session, broken)
    session.commit()

    outcome = reoptimise_plan(
        session, matrix_service(), organisation.id, result.plan.id,
        ReoptimisationTrigger(reason="VEHICLE_BREAKDOWN", vehicle_id=broken.id,
                              delay_minutes=45),  # above the 20-minute auto threshold
        time_limit_seconds=3,
    )
    assert outcome.requires_approval
    assert outcome.new_plan.plan.status == PlanStatus.PENDING_APPROVAL
    # Previous plan remains live until the replacement is approved.
    assert PlanRepo.get(session, organisation.id, result.plan.id).status == PlanStatus.PUBLISHED
    # Drivers are not notified about an unapproved plan.
    assert outcome.notifications == []

    approve_plan(session, organisation.id, outcome.new_plan.plan.id, actor="admin")
    session.commit()
    assert PlanRepo.get(session, organisation.id, result.plan.id).status == PlanStatus.SUPERSEDED


def test_auto_published_reopt_notifies_drivers(session, organisation, published_plan):
    from aiviate.db import tables as t

    result, drivers, vehicles = published_plan
    org_row = session.get(t.OrganisationRow, organisation.id)
    doc = dict(org_row.operating_rules)
    doc["approval"] = {"auto_dispatch_enabled": True, "auto_publish_threshold": 0.5,
                       "approval_threshold": 0.3, "reopt_max_auto_delay_minutes": 60,
                       "reopt_max_auto_reassigned_orders": 50}
    org_row.operating_rules = doc
    session.commit()

    notifier = LoggingNotifier()
    outcome = reoptimise_plan(
        session, matrix_service(), organisation.id, result.plan.id,
        ReoptimisationTrigger(reason="DRIVER_DELAY", driver_id=result.routes[0].driver_id,
                              delay_minutes=5),
        notifier=notifier,
        time_limit_seconds=3,
    )
    session.commit()
    assert not outcome.requires_approval
    assert outcome.new_plan.plan.status == PlanStatus.PUBLISHED
    assert outcome.notifications, "drivers must be notified once the plan is valid"
    assert PlanRepo.get(session, organisation.id, result.plan.id).status == PlanStatus.SUPERSEDED

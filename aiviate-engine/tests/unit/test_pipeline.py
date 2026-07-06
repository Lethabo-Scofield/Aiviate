"""End-to-end pipeline: ready orders → plan → approval workflow → audit."""

import pytest
from sqlalchemy import select

from aiviate.db import tables as t
from aiviate.db.repo import DriverRepo, OrderRepo, PlanRepo, VehicleRepo
from aiviate.domain.enums import OrderStatus, PlanStatus, SolverStatus
from aiviate.engine import PlanningError, approve_plan, create_plan, reject_plan
from aiviate.matrix import MatrixService
from aiviate.matrix.haversine import HaversineFallbackProvider
from tests.conftest import PLANNING_DAY, make_driver, make_order, make_vehicle
from tests.solver.helpers import JOBURG_CENTRE, PRETORIA_CENTRE, SOWETO_CENTRE, spread


@pytest.fixture()
def fleet(session, organisation):
    drivers = [
        make_driver(organisation.id, f"Driver {i}", -26.14, 28.04) for i in range(1, 4)
    ]
    vehicles = [make_vehicle(organisation.id, f"REG-{i:03d}") for i in range(1, 4)]
    for driver, vehicle in zip(drivers, vehicles):
        driver.assigned_vehicle_id = vehicle.id
        DriverRepo.save(session, driver)
        VehicleRepo.save(session, vehicle)
    session.commit()
    return drivers, vehicles


@pytest.fixture()
def ready_orders(session, organisation):
    orders = []
    centres = [JOBURG_CENTRE, SOWETO_CENTRE, PRETORIA_CENTRE]
    n = 0
    for centre in centres:
        for point in spread(centre, 5):
            n += 1
            order = make_order(organisation.id, f"ORD-{n:03d}", point.latitude, point.longitude)
            OrderRepo.save(session, order)
            orders.append(order)
    session.commit()
    return orders


def matrix_service() -> MatrixService:
    return MatrixService(HaversineFallbackProvider())


def test_create_plan_produces_validated_routes(session, organisation, fleet, ready_orders):
    result = create_plan(session, matrix_service(), organisation.id, PLANNING_DAY,
                         time_limit_seconds=3)
    session.commit()

    assert result.validation.is_valid
    assert result.solution.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
    assert result.plan.status == PlanStatus.PENDING_APPROVAL  # auto dispatch off by default
    assert 1 <= len(result.routes) <= 3
    assert result.unassigned_order_ids == []
    assigned = [s.order_id for stops in result.stops.values() for s in stops]
    assert sorted(assigned) == sorted(o.id for o in ready_orders)

    # Confidence recorded and explainable.
    assert result.confidence is not None
    assert 0 < result.confidence.score <= 1

    # Audit trail exists: plan creation + one assignment record per route.
    audits = session.execute(
        select(t.DecisionAuditRow).where(t.DecisionAuditRow.plan_id == result.plan.id)
    ).scalars().all()
    types = [a.decision_type for a in audits]
    assert "plan_created" in types
    assert types.count("assignment") == len(result.routes)
    creation = next(a for a in audits if a.decision_type == "plan_created")
    assert creation.input_snapshot["order_ids"]
    assert creation.rules_applied


def test_approval_workflow(session, organisation, fleet, ready_orders):
    result = create_plan(session, matrix_service(), organisation.id, PLANNING_DAY,
                         time_limit_seconds=3)
    session.commit()

    plan = approve_plan(session, organisation.id, result.plan.id, actor="admin@pilot")
    session.commit()
    assert plan.status == PlanStatus.PUBLISHED
    assert plan.approved_at is not None
    # Orders move to assigned.
    statuses = {o.status for o in OrderRepo.list(session, organisation.id,
                                                 ids=[o.id for o in ready_orders])}
    assert statuses == {OrderStatus.ASSIGNED}

    with pytest.raises(PlanningError):
        approve_plan(session, organisation.id, result.plan.id, actor="admin@pilot")


def test_reject_releases_orders(session, organisation, fleet, ready_orders):
    result = create_plan(session, matrix_service(), organisation.id, PLANNING_DAY,
                         time_limit_seconds=3)
    session.commit()
    reject_plan(session, organisation.id, result.plan.id, actor="admin@pilot", note="wrong day")
    session.commit()

    plan = PlanRepo.get(session, organisation.id, result.plan.id)
    assert plan.status == PlanStatus.REJECTED
    statuses = {o.status for o in OrderRepo.list(session, organisation.id,
                                                 ids=[o.id for o in ready_orders])}
    assert statuses == {OrderStatus.READY}


def test_auto_publish_when_enabled(session, organisation, fleet, ready_orders):
    org_row = session.get(t.OrganisationRow, organisation.id)
    rules_doc = dict(org_row.operating_rules)
    rules_doc["approval"] = {"auto_dispatch_enabled": True, "auto_publish_threshold": 0.5,
                             "approval_threshold": 0.3}
    org_row.operating_rules = rules_doc
    session.commit()

    result = create_plan(session, matrix_service(), organisation.id, PLANNING_DAY,
                         time_limit_seconds=3)
    session.commit()
    assert result.plan.status == PlanStatus.PUBLISHED


def test_no_orders_raises(session, organisation, fleet):
    with pytest.raises(PlanningError):
        create_plan(session, matrix_service(), organisation.id, PLANNING_DAY)


def test_tenant_isolation_other_org_resources_unused(session, organisation, fleet, ready_orders):
    from aiviate.domain import models as m

    other = m.Organisation(name="Rival", operating_rules={})
    session.add(t.OrganisationRow(**other.model_dump()))
    rival_driver = make_driver(other.id, "Rival Driver", -26.1, 28.0)
    DriverRepo.save(session, rival_driver)
    session.commit()

    result = create_plan(session, matrix_service(), organisation.id, PLANNING_DAY,
                         time_limit_seconds=3)
    used_drivers = {r.driver_id for r in result.routes}
    assert rival_driver.id not in used_drivers

from datetime import datetime

import pytest

from aiviate.db import tables as t
from aiviate.db.repo import DriverRepo, OrderRepo, PlanRepo
from aiviate.domain import models as m
from aiviate.domain.enums import (
    EventSeverity,
    EventType,
    OrderStatus,
    RouteStatus,
    SafetyStatus,
    StopStatus,
)
from aiviate.notifications import LoggingNotifier, LoggingVoiceEscalation
from aiviate.safety import process_safety_event
from tests.conftest import PLANNING_DAY, make_driver, make_order, make_vehicle


@pytest.fixture()
def driver(session, organisation):
    driver = make_driver(organisation.id, "Sipho", -26.14, 28.04)
    DriverRepo.save(session, driver)
    session.commit()
    return driver


@pytest.fixture()
def active_route(session, organisation, driver):
    """A published plan with one active route carrying three stops."""
    vehicle = make_vehicle(organisation.id, "GP-001")
    session.add(t.VehicleRow(**vehicle.model_dump()))
    plan = m.DispatchPlan(organisation_id=organisation.id, planning_date=PLANNING_DAY,
                          status="published")
    PlanRepo.save(session, plan)
    route = m.Route(
        plan_id=plan.id, driver_id=driver.id, vehicle_id=vehicle.id,
        status=RouteStatus.ACTIVE,
        start_location=m.Location(latitude=-26.14, longitude=28.04, label="depot"),
        end_location=m.Location(latitude=-26.14, longitude=28.04, label="depot"),
    )
    PlanRepo.save_route(session, route)
    stops = []
    for i, status in enumerate([StopStatus.COMPLETED, StopStatus.ACTIVE, StopStatus.PENDING], 1):
        order = make_order(organisation.id, f"ORD-S{i}", -26.2, 28.0,
                           status=OrderStatus.DELIVERED if status == StopStatus.COMPLETED
                           else OrderStatus.ASSIGNED)
        OrderRepo.save(session, order)
        stop = m.RouteStop(route_id=route.id, order_id=order.id, sequence_number=i,
                           estimated_arrival=PLANNING_DAY.replace(hour=8 + i),
                           estimated_departure=PLANNING_DAY.replace(hour=8 + i, minute=10),
                           status=status)
        PlanRepo.save_stop(session, stop)
        stops.append(stop)
    session.commit()
    return route, stops


def event(org_id, driver_id=None, route_id=None, etype=EventType.FATIGUE_WARNING,
          severity=EventSeverity.WARNING, occurred_at=None):
    return m.OperationalEvent(
        organisation_id=org_id, driver_id=driver_id, route_id=route_id,
        event_type=etype, severity=severity,
        occurred_at=occurred_at or datetime(2026, 7, 6, 10, 0),
    )


def test_first_fatigue_warning_sets_warning_status(session, organisation, driver):
    notifier = LoggingNotifier()
    result = process_safety_event(session, organisation.id,
                                  event(organisation.id, driver.id), notifier=notifier)
    assert result.driver_safety_status == SafetyStatus.WARNING
    assert not result.reoptimisation_required
    recipients = {(n.recipient_type, n.recipient_id) for n in notifier.sent}
    assert ("driver", driver.id) in recipients
    assert ("administrator", organisation.id) in recipients


def test_repeated_fatigue_requires_break_and_reopt(session, organisation, driver, active_route):
    route, _ = active_route
    process_safety_event(session, organisation.id, event(organisation.id, driver.id, route.id))
    result = process_safety_event(session, organisation.id,
                                  event(organisation.id, driver.id, route.id))
    assert result.driver_safety_status == SafetyStatus.BREAK_REQUIRED
    assert result.reoptimisation_required
    assert result.reoptimisation_route_id == route.id


def test_single_possible_accident_holds_but_never_suspends(session, organisation, driver,
                                                           active_route):
    route, stops = active_route
    voice = LoggingVoiceEscalation()
    result = process_safety_event(
        session, organisation.id,
        event(organisation.id, driver.id, route.id, EventType.POSSIBLE_ACCIDENT,
              EventSeverity.CRITICAL),
        voice=voice,
    )
    assert result.route_status == RouteStatus.SAFETY_HOLD
    assert result.returned_order_ids == []
    assert result.driver_safety_status is None  # not blocked on one weak signal
    assert voice.calls == []  # no emergency call from a single sensor signal


def test_corroborated_accident_suspends_and_returns_orders(session, organisation, driver,
                                                           active_route):
    route, stops = active_route
    first = event(organisation.id, driver.id, route.id, EventType.POSSIBLE_ACCIDENT,
                  EventSeverity.CRITICAL)
    second = event(organisation.id, driver.id, route.id, EventType.DRIVER_UNRESPONSIVE,
                   EventSeverity.CRITICAL)
    process_safety_event(session, organisation.id, first)
    result = process_safety_event(session, organisation.id, second)

    assert result.route_status == RouteStatus.SUSPENDED
    assert result.driver_safety_status == SafetyStatus.BLOCKED
    # Active + pending stops returned; the completed stop is untouched.
    assert len(result.returned_order_ids) == 2
    assert result.reoptimisation_required
    refreshed = PlanRepo.stops(session, route.id)
    assert refreshed[0].status == StopStatus.COMPLETED
    assert {s.status for s in refreshed[1:]} == {StopStatus.RETURNED}
    returned_orders = OrderRepo.list(session, organisation.id, ids=result.returned_order_ids)
    assert {o.status for o in returned_orders} == {OrderStatus.RETURNED_TO_DISPATCH}


def test_manual_emergency_is_immediate(session, organisation, driver, active_route):
    route, _ = active_route
    result = process_safety_event(
        session, organisation.id,
        event(organisation.id, driver.id, route.id, EventType.MANUAL_EMERGENCY,
              EventSeverity.CRITICAL),
    )
    assert result.route_status == RouteStatus.SUSPENDED
    assert result.driver_safety_status == SafetyStatus.BLOCKED


def test_voice_escalation_only_when_enabled_and_confirmed(session, organisation, driver,
                                                          active_route):
    route, _ = active_route
    org_row = session.get(t.OrganisationRow, organisation.id)
    doc = dict(org_row.operating_rules)
    doc["safety"] = {"voice_escalation_enabled": True,
                     "escalation_contacts": ["+27115550000"]}
    org_row.operating_rules = doc
    session.commit()

    voice = LoggingVoiceEscalation()
    result = process_safety_event(
        session, organisation.id,
        event(organisation.id, driver.id, route.id, EventType.ACCIDENT_CONFIRMED,
              EventSeverity.CRITICAL),
        voice=voice,
    )
    assert len(voice.calls) == 1
    assert voice.calls[0][0] == "+27115550000"
    assert any("Voice escalation" in a for a in result.actions)


def test_duplicate_events_deduplicated(session, organisation, driver):
    key = "device-42-evt-100"
    first = process_safety_event(session, organisation.id,
                                 event(organisation.id, driver.id), dedupe_key=key)
    session.commit()
    second = process_safety_event(session, organisation.id,
                                  event(organisation.id, driver.id), dedupe_key=key)
    assert not first.duplicate
    assert second.duplicate
    assert second.event_id == first.event_id


def test_device_offline_notifies_admin_only(session, organisation, driver):
    notifier = LoggingNotifier()
    result = process_safety_event(
        session, organisation.id,
        event(organisation.id, driver.id, etype=EventType.DEVICE_OFFLINE,
              severity=EventSeverity.INFO),
        notifier=notifier,
    )
    assert result.driver_safety_status is None
    assert all(n.recipient_type == "administrator" for n in notifier.sent)

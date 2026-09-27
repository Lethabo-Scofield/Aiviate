from datetime import datetime

from aiviate.assignment import build_candidates, explain_assignment
from aiviate.domain.enums import DriverStatus, SafetyStatus, VehicleStatus
from aiviate.domain.geo import Coordinate
from tests.conftest import make_driver, make_vehicle

ORG = "org-1"
START = datetime(2026, 7, 6, 7, 0)
END = datetime(2026, 7, 6, 17, 0)


def test_only_available_and_safe_drivers_are_candidates():
    drivers = [
        make_driver(ORG, "Available A", -26.1, 28.0),
        make_driver(ORG, "Suspended B", -26.1, 28.0, status=DriverStatus.SUSPENDED),
        make_driver(ORG, "Blocked C", -26.1, 28.0, safety_status=SafetyStatus.BLOCKED),
        make_driver(ORG, "OffShift D", -26.1, 28.0,
                    shift_start=datetime(2026, 7, 6, 19), shift_end=datetime(2026, 7, 6, 23)),
    ]
    vehicles = [make_vehicle(ORG, f"VEH-{i}") for i in range(4)]
    result = build_candidates(drivers, vehicles, START, END)

    assert [c.driver.name for c in result.candidates] == ["Available A"]
    reasons = {r.reason for r in result.rejected if r.driver_id}
    assert any("suspended" in r for r in reasons)
    assert any("blocked" in r for r in reasons)
    assert any("shift" in r for r in reasons)


def test_unavailable_vehicles_excluded():
    drivers = [make_driver(ORG, "A", -26.1, 28.0), make_driver(ORG, "B", -26.1, 28.0)]
    vehicles = [
        make_vehicle(ORG, "GOOD"),
        make_vehicle(ORG, "BROKEN", status=VehicleStatus.BREAKDOWN),
    ]
    result = build_candidates(drivers, vehicles, START, END)
    assert len(result.candidates) == 1
    assert result.candidates[0].vehicle.registration_number == "GOOD"


def test_assigned_vehicle_preferred():
    vehicle_small = make_vehicle(ORG, "SMALL", maximum_weight=100)
    vehicle_big = make_vehicle(ORG, "BIG", maximum_weight=2000)
    driver = make_driver(ORG, "A", -26.1, 28.0, assigned_vehicle_id=vehicle_small.id)
    result = build_candidates([driver], [vehicle_big, vehicle_small], START, END)
    assert result.candidates[0].vehicle.id == vehicle_small.id
    assert "assigned vehicle" in result.candidates[0].reasons[0]


def test_busy_resources_never_reassigned():
    driver = make_driver(ORG, "Busy", -26.1, 28.0)
    vehicle = make_vehicle(ORG, "V1")
    result = build_candidates([driver], [vehicle], START, END,
                              busy_driver_ids={driver.id}, busy_vehicle_ids=set())
    assert result.candidates == []
    assert any("active route" in r.reason for r in result.rejected)


def test_explanation_contains_required_reasons():
    driver = make_driver(ORG, "A", -26.2041, 28.0473)
    vehicle = make_vehicle(ORG, "V1")
    result = build_candidates([driver], [vehicle], START, END)
    explanation = explain_assignment(
        "ROUTE-12",
        result.candidates[0],
        route_start=Coordinate(latitude=-26.1438, longitude=28.0406),
        route_duration_minutes=250,
        route_weight_kg=350,
        route_volume_m3=2.5,
        rejected=result.rejected,
    )
    assert explanation["route_id"] == "ROUTE-12"
    assert explanation["selected_driver_id"] == driver.id
    text = " ".join(explanation["reasons"])
    assert "route duration" in text
    assert "weight and volume capacity" in text
    assert "km from the route starting location" in text

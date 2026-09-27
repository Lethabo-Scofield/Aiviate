"""Deterministic pilot simulation.

One organisation, three drivers, three vehicles, one depot and thirty orders
(ten around each of three urban centres — Johannesburg, Soweto and Pretoria as
*test data*; the engine sees only coordinates and configuration).

    python -m aiviate.simulation.pilot

Everything derives from a fixed seed: coordinate generation, addresses,
weights and windows. The travel matrix is the deterministic haversine fixture,
so repeated runs see identical inputs.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from aiviate.audit import plan_explanation
from aiviate.db import tables as t
from aiviate.db.base import Base
from aiviate.db.repo import DriverRepo, OrderRepo, PlanRepo, VehicleRepo
from aiviate.domain import models as m
from aiviate.domain.enums import (
    EventSeverity,
    EventType,
    OrderPriority,
    OrderStatus,
    RouteStatus,
    StopStatus,
    VehicleStatus,
)
from aiviate.engine import approve_plan, create_plan
from aiviate.matrix import MatrixService
from aiviate.matrix.haversine import HaversineFallbackProvider
from aiviate.reoptimization import reoptimise_plan
from aiviate.reoptimization.controller import ReoptimisationTrigger
from aiviate.safety import process_safety_event

SEED = 42
PLANNING_DAY = datetime(2026, 7, 6)

# Test-fixture geography (configuration, not engine logic).
DEPOT = {"latitude": -26.1438, "longitude": 28.0406}
CENTRES = {
    "Johannesburg": (-26.2041, 28.0473),
    "Soweto": (-26.2678, 27.8585),
    "Pretoria": (-25.7479, 28.2293),
}
SERVICE_AREA = {
    "min_latitude": -26.6, "max_latitude": -25.5,
    "min_longitude": 27.6, "max_longitude": 28.5,
}


@dataclass
class SimulationReport:
    lines: list[str]
    data: dict[str, Any]

    def print(self) -> None:
        import sys

        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        for line in self.lines:
            print(line)


def run_pilot_simulation(echo: bool = False) -> SimulationReport:
    rng = random.Random(SEED)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, echo=echo)
    Base.metadata.create_all(engine)
    session: Session = sessionmaker(bind=engine, expire_on_commit=False)()
    matrix_service = MatrixService(HaversineFallbackProvider())
    lines: list[str] = []
    data: dict[str, Any] = {}

    def say(text: str = "") -> None:
        lines.append(text)

    # --- 1. Seed world -------------------------------------------------------
    org = m.Organisation(
        name="Pilot Logistics",
        operating_rules={
            "geocoding": {"service_area": SERVICE_AREA},
            "depots": [DEPOT],
            "approval": {"auto_dispatch_enabled": True, "auto_publish_threshold": 0.80,
                         "approval_threshold": 0.60},
        },
    )
    session.add(t.OrganisationRow(**org.model_dump(), webhook_secret="sim-secret"))
    session.flush()  # rows below reference the organisation by FK

    drivers, vehicles = [], []
    for i in range(1, 4):
        vehicle = m.Vehicle(organisation_id=org.id, registration_number=f"AIV-{i:03d}-GP",
                            maximum_weight=800.0, maximum_volume=6.0, device_id=f"device-{i}")
        VehicleRepo.save(session, vehicle)
        driver = m.Driver(
            organisation_id=org.id, name=f"Driver {i}", email=f"driver{i}@pilot.example",
            current_latitude=DEPOT["latitude"], current_longitude=DEPOT["longitude"],
            shift_start=PLANNING_DAY.replace(hour=7), shift_end=PLANNING_DAY.replace(hour=17),
            assigned_vehicle_id=vehicle.id,
        )
        DriverRepo.save(session, driver)
        drivers.append(driver)
        vehicles.append(vehicle)

    orders: list[m.Order] = []
    n = 0
    for area, (lat, lon) in CENTRES.items():
        for _ in range(10):
            n += 1
            order = m.Order(
                organisation_id=org.id,
                external_order_id=f"ORD-{n:03d}",
                customer_name=f"Customer {n}",
                customer_phone=f"+2711{rng.randint(1000000, 9999999)}",
                raw_address=f"{rng.randint(1, 250)} Simulation Street, {area}",
                normalised_address=f"{n} simulation street {area.lower()}",
                latitude=lat + rng.uniform(-0.03, 0.03),
                longitude=lon + rng.uniform(-0.03, 0.03),
                geocoding_confidence=round(rng.uniform(0.88, 0.99), 3),
                package_weight=round(rng.uniform(5, 60), 1),
                package_volume=round(rng.uniform(0.05, 0.4), 3),
                priority=rng.choice([OrderPriority.STANDARD, OrderPriority.STANDARD,
                                     OrderPriority.STANDARD, OrderPriority.HIGH]),
                delivery_window_start=PLANNING_DAY.replace(hour=8),
                delivery_window_end=PLANNING_DAY.replace(hour=16),
                service_time_minutes=5,
                status=OrderStatus.READY,
            )
            OrderRepo.save(session, order)
            orders.append(order)
    session.commit()

    say("=== Aiviate pilot simulation (seed 42) ===")
    say(f"Organisation: {org.name} | 3 drivers, 3 vehicles, {len(orders)} orders, 1 depot")
    say()

    # --- 2-4. Matrix fixture + optimisation ---------------------------------
    result = create_plan(session, matrix_service, org.id, PLANNING_DAY, time_limit_seconds=5)
    session.commit()
    plan = result.plan
    say(f"Plan {plan.id[:8]}… status={plan.status} solver={plan.solver_status} "
        f"confidence={plan.confidence_score}")
    say(f"Totals: {plan.total_distance} km, {plan.total_duration} min")
    say()

    # --- 5-6. Routes, assignments, distances --------------------------------
    driver_names = {d.id: d.name for d in drivers}
    vehicle_regs = {v.id: v.registration_number for v in vehicles}
    for route in result.routes:
        stops = result.stops[route.id]
        say(f"Route {route.id[:8]}…: {driver_names[route.driver_id]} in "
            f"{vehicle_regs[route.vehicle_id]} — {len(stops)} stops, "
            f"{route.estimated_distance} km, {route.estimated_duration} min, "
            f"load {route.capacity_usage['weight_kg']:.0f} kg "
            f"({route.capacity_usage['weight_utilisation']:.0%})")
    if result.unassigned_order_ids:
        say(f"Unassigned orders: {result.unassigned_order_ids}")
    say()
    data["initial_plan"] = plan
    data["initial_routes"] = result.routes

    if plan.status != "published":
        approve_plan(session, org.id, plan.id, actor="sim-admin")
        session.commit()
        say("Plan required approval — approved by sim-admin.")

    # --- 7-8. Vehicle breakdown → re-optimisation ---------------------------
    say("--- Event: vehicle breakdown ---")
    victim_route = max(result.routes, key=lambda r: len(result.stops[r.id]))
    victim_stops = result.stops[victim_route.id]
    # Driver completed the first stop before the breakdown.
    first = victim_stops[0]
    first.status = StopStatus.COMPLETED
    PlanRepo.save_stop(session, first)
    delivered = OrderRepo.get(session, org.id, first.order_id)
    assert delivered is not None
    delivered.status = OrderStatus.DELIVERED
    OrderRepo.save(session, delivered)
    victim_route.status = RouteStatus.ACTIVE
    PlanRepo.save_route(session, victim_route)
    broken = next(v for v in vehicles if v.id == victim_route.vehicle_id)
    broken.status = VehicleStatus.BREAKDOWN
    VehicleRepo.save(session, broken)
    session.commit()

    outcome = reoptimise_plan(
        session, matrix_service, org.id, plan.id,
        ReoptimisationTrigger(reason="VEHICLE_BREAKDOWN", vehicle_id=broken.id,
                              interrupt_active_stop=True, delay_minutes=18),
        time_limit_seconds=5,
    )
    session.commit()
    diff = outcome.diff
    say(f"Vehicle {vehicle_regs[broken.id]} broke down on "
        f"{driver_names[victim_route.driver_id]}'s route "
        f"(1 stop already completed and preserved).")
    say(f"Difference report: {diff['reassigned_orders']} orders reassigned across "
        f"{diff['changed_routes']} routes; affected drivers "
        f"{[driver_names.get(d, d) for d in diff['affected_drivers']]}; "
        f"unassigned {diff['unassigned_orders']}; "
        f"estimated delay {diff['estimated_delay_minutes']} min")
    say(f"New plan {outcome.new_plan.plan.id[:8]}… status={outcome.new_plan.plan.status}"
        f" (approval required: {outcome.requires_approval})")
    if outcome.new_plan.plan.status == "pending_approval":
        approve_plan(session, org.id, outcome.new_plan.plan.id, actor="sim-admin")
        session.commit()
        say("Re-optimised plan approved by sim-admin.")
    say()
    data["breakdown_diff"] = diff

    # --- 9-10. Fatigue event and its operational effect ----------------------
    say("--- Event: driver fatigue ---")
    active_plan = outcome.new_plan
    fatigue_route = active_plan.routes[0]
    fatigue_driver_id = fatigue_route.driver_id
    for k in range(2):  # two warnings within the window trigger a required break
        safety_result = process_safety_event(
            session, org.id,
            m.OperationalEvent(
                organisation_id=org.id, driver_id=fatigue_driver_id,
                route_id=fatigue_route.id, event_type=EventType.FATIGUE_WARNING,
                severity=EventSeverity.WARNING,
                occurred_at=PLANNING_DAY.replace(hour=10, minute=k * 20),
            ),
            dedupe_key=f"sim-fatigue-{k}",
        )
    session.commit()
    say(f"Driver {driver_names[fatigue_driver_id]}: "
        + "; ".join(safety_result.actions))
    say(f"Safety status: {safety_result.driver_safety_status}; "
        f"re-optimisation required: {safety_result.reoptimisation_required}")
    driver_after = DriverRepo.get(session, org.id, fatigue_driver_id)
    assert driver_after is not None
    say(f"Operational effect: driver safety status is now '{driver_after.safety_status}' — "
        "the driver is excluded from new route assignments until the break is taken.")
    say()
    data["fatigue_result"] = safety_result

    # --- 11. Audit explanation ----------------------------------------------
    say("--- Audit explanation (re-optimised plan) ---")
    explanation = plan_explanation(session, org.id, active_plan.plan.id)
    for decision in explanation["decisions"]:
        say(f"[{decision['decision_type']}]")
        for line in decision["explanation"].splitlines():
            say(f"  {line}")
    data["explanation"] = explanation

    session.close()
    return SimulationReport(lines=lines, data=data)


if __name__ == "__main__":
    run_pilot_simulation().print()

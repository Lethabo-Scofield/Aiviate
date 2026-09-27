"""Driver/vehicle candidate construction and assignment explanations.

Eligibility is decided here (availability, safety state, shift, capacity,
vehicle type); the solver then chooses among eligible pairs. Ineligible
drivers or vehicles never reach the solver, so "unavailable driver receives a
route" is impossible by construction — and plan validation re-checks anyway.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from aiviate.domain.enums import DriverStatus, SafetyStatus, VehicleStatus
from aiviate.domain.geo import Coordinate, haversine_km
from aiviate.domain.models import Driver, Vehicle
from aiviate.observability import get_logger, log_ctx

logger = get_logger(__name__)

ELIGIBLE_DRIVER_STATUSES = {DriverStatus.AVAILABLE}
ELIGIBLE_SAFETY_STATUSES = {SafetyStatus.NORMAL, SafetyStatus.WARNING}
ELIGIBLE_VEHICLE_STATUSES = {VehicleStatus.AVAILABLE}


@dataclass
class AssignmentCandidate:
    driver: Driver
    vehicle: Vehicle
    reasons: list[str] = field(default_factory=list)


@dataclass
class RejectedCandidate:
    driver_id: str | None
    vehicle_id: str | None
    reason: str


@dataclass
class CandidateSet:
    candidates: list[AssignmentCandidate]
    rejected: list[RejectedCandidate]


def build_candidates(
    drivers: list[Driver],
    vehicles: list[Vehicle],
    planning_start: datetime,
    planning_end: datetime,
    required_vehicle_types: set[str] | None = None,
    busy_driver_ids: set[str] | None = None,
    busy_vehicle_ids: set[str] | None = None,
) -> CandidateSet:
    """Pair each eligible driver with an eligible vehicle.

    A driver's assigned vehicle is preferred; otherwise vehicles are matched
    greedily by descending capacity. ``busy_*`` are resources holding active
    routes (they cannot take overlapping work).
    """
    busy_driver_ids = busy_driver_ids or set()
    busy_vehicle_ids = busy_vehicle_ids or set()
    rejected: list[RejectedCandidate] = []

    eligible_drivers: list[Driver] = []
    for driver in drivers:
        if driver.id in busy_driver_ids:
            rejected.append(RejectedCandidate(driver.id, None, "Driver already has an active route."))
        elif driver.status not in ELIGIBLE_DRIVER_STATUSES:
            rejected.append(RejectedCandidate(driver.id, None, f"Driver status is '{driver.status}'."))
        elif driver.safety_status not in ELIGIBLE_SAFETY_STATUSES:
            rejected.append(
                RejectedCandidate(driver.id, None, f"Driver safety status is '{driver.safety_status}'.")
            )
        elif driver.shift_end <= planning_start or driver.shift_start >= planning_end:
            rejected.append(
                RejectedCandidate(driver.id, None, "Driver shift does not overlap the planning window.")
            )
        else:
            eligible_drivers.append(driver)

    eligible_vehicles: list[Vehicle] = []
    for vehicle in vehicles:
        if vehicle.id in busy_vehicle_ids:
            rejected.append(RejectedCandidate(None, vehicle.id, "Vehicle already operates an active route."))
        elif vehicle.status not in ELIGIBLE_VEHICLE_STATUSES:
            rejected.append(RejectedCandidate(None, vehicle.id, f"Vehicle status is '{vehicle.status}'."))
        elif required_vehicle_types and vehicle.vehicle_type not in required_vehicle_types:
            rejected.append(
                RejectedCandidate(None, vehicle.id, f"Vehicle type '{vehicle.vehicle_type}' not required.")
            )
        else:
            eligible_vehicles.append(vehicle)

    candidates: list[AssignmentCandidate] = []
    remaining = sorted(eligible_vehicles, key=lambda v: (-v.maximum_weight, -v.maximum_volume, v.id))
    # Preferred pairings first (driver.assigned_vehicle_id), then greedy.
    unpaired: list[Driver] = []
    for driver in sorted(eligible_drivers, key=lambda d: d.id):
        preferred = next((v for v in remaining if v.id == driver.assigned_vehicle_id), None)
        if preferred is not None:
            remaining.remove(preferred)
            candidates.append(
                AssignmentCandidate(driver, preferred, ["Driver is paired with their assigned vehicle."])
            )
        else:
            unpaired.append(driver)
    for driver in unpaired:
        if not remaining:
            rejected.append(RejectedCandidate(driver.id, None, "No eligible vehicle left to pair."))
            continue
        vehicle = remaining.pop(0)
        candidates.append(
            AssignmentCandidate(driver, vehicle, ["Paired with the highest-capacity unassigned vehicle."])
        )

    logger.info(
        "assignment candidates built",
        extra=log_ctx(candidates=len(candidates), rejected=len(rejected)),
    )
    return CandidateSet(candidates=candidates, rejected=rejected)


def explain_assignment(
    route_id: str,
    candidate: AssignmentCandidate,
    route_start: Coordinate,
    route_duration_minutes: float,
    route_weight_kg: float,
    route_volume_m3: float,
    rejected: list[RejectedCandidate],
) -> dict:
    """Human-readable justification of a route's driver/vehicle selection."""
    driver, vehicle = candidate.driver, candidate.vehicle
    reasons = list(candidate.reasons)

    shift_minutes = (driver.shift_end - driver.shift_start).total_seconds() / 60
    reasons.append(
        "Driver is available for the complete estimated route duration "
        f"({route_duration_minutes:.0f} of {shift_minutes:.0f} shift minutes)."
    )
    reasons.append(
        f"Vehicle has sufficient weight and volume capacity "
        f"({route_weight_kg:.1f}/{vehicle.maximum_weight:.0f} kg, "
        f"{route_volume_m3:.2f}/{vehicle.maximum_volume:.1f} m³)."
    )
    if driver.coordinate is not None:
        distance = haversine_km(driver.coordinate, route_start)
        reasons.append(f"Driver is {distance:.1f} km from the route starting location.")
    for reject in rejected[:5]:
        subject = f"Driver {reject.driver_id}" if reject.driver_id else f"Vehicle {reject.vehicle_id}"
        reasons.append(f"Alternative not selected: {subject} — {reject.reason}")

    return {
        "route_id": route_id,
        "selected_driver_id": driver.id,
        "selected_vehicle_id": vehicle.id,
        "reasons": reasons,
    }

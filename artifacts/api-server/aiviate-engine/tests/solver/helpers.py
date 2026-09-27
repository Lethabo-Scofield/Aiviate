"""Deterministic fixtures for solver scenarios.

Coordinates approximate the three pilot areas (Johannesburg, Soweto,
Pretoria) purely as test data; the engine only ever sees coordinates.
"""

from __future__ import annotations

from datetime import datetime

from aiviate.domain.enums import OrderPriority
from aiviate.domain.geo import Coordinate
from aiviate.matrix.haversine import HaversineFallbackProvider
from aiviate.matrix.provider import TravelMatrix
from aiviate.rules.engine import ObjectiveWeights
from aiviate.solver.model import OrderNode, SolverInput, VehicleSpec

DEPOT = Coordinate(latitude=-26.1438, longitude=28.0406)
JOBURG_CENTRE = Coordinate(latitude=-26.2041, longitude=28.0473)
SOWETO_CENTRE = Coordinate(latitude=-26.2678, longitude=27.8585)
PRETORIA_CENTRE = Coordinate(latitude=-25.7479, longitude=28.2293)

HORIZON_START = datetime(2026, 7, 6, 6, 0)

H = 3600


def spread(centre: Coordinate, count: int, radius_deg: float = 0.02) -> list[Coordinate]:
    """Deterministic ring of points around a centre."""
    points = []
    for k in range(count):
        angle = (k * 137) % 360  # golden-angle-ish spread, no RNG needed
        import math

        points.append(
            Coordinate(
                latitude=centre.latitude + radius_deg * math.sin(math.radians(angle)),
                longitude=centre.longitude + radius_deg * math.cos(math.radians(angle)),
            )
        )
    return points


def build_matrix(points: list[Coordinate]) -> TravelMatrix:
    result = HaversineFallbackProvider().compute(points)
    return TravelMatrix(
        points=points,
        entries=result.entries,
        provider="haversine_fallback",
        fallback_entry_count=len(points) ** 2,
    )


def vehicle_spec(
    index: int,
    *,
    weight_kg: float = 800.0,
    volume_m3: float = 6.0,
    shift_start_s: int = 1 * H,  # 07:00 relative to 06:00 horizon
    shift_end_s: int = 11 * H,  # 17:00
    max_overtime_s: int = 3600,
    start_point: int = 0,
    end_point: int = 0,
) -> VehicleSpec:
    return VehicleSpec(
        driver_id=f"DRV-{index:02d}",
        vehicle_id=f"VEH-{index:02d}",
        start_point=start_point,
        end_point=end_point,
        weight_capacity_g=round(weight_kg * 1000),
        volume_capacity_ml=round(volume_m3 * 1_000_000),
        shift_start_s=shift_start_s,
        shift_end_s=shift_end_s,
        max_overtime_s=max_overtime_s,
    )


def order_node(
    order_id: str,
    point: int,
    *,
    weight_kg: float = 20.0,
    volume_m3: float = 0.2,
    window=(2 * H, 10 * H),
    service_s: int = 300,
    priority: OrderPriority = OrderPriority.STANDARD,
    allowed_late_s: int = 0,
    allowed_vehicles: list[int] | None = None,
) -> OrderNode:
    return OrderNode(
        order_id=order_id,
        point=point,
        weight_g=round(weight_kg * 1000),
        volume_ml=round(volume_m3 * 1_000_000),
        window_start_s=window[0],
        window_end_s=window[1],
        allowed_late_s=allowed_late_s,
        service_time_s=service_s,
        priority=priority,
        allowed_vehicles=allowed_vehicles,
    )


def problem(
    vehicles: list[VehicleSpec],
    orders: list[OrderNode],
    points: list[Coordinate],
    **overrides,
) -> SolverInput:
    defaults = dict(
        horizon_start=HORIZON_START,
        vehicles=vehicles,
        orders=orders,
        matrix=build_matrix(points),
        weights=ObjectiveWeights(),
        time_limit_seconds=3,
    )
    defaults.update(overrides)
    return SolverInput(**defaults)

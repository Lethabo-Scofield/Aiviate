"""Typed solver inputs and outputs.

Units inside the solver are integers: seconds, metres, grams, millilitres and
scaled cost units. Conversions from domain units happen exactly once, here.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from aiviate.domain.enums import OrderPriority, SolverStatus
from aiviate.matrix.provider import TravelMatrix
from aiviate.rules.engine import ObjectiveWeights

COST_SCALE = 100  # objective cost units per weight unit, for integer precision


class VehicleSpec(BaseModel):
    """One dispatchable unit: an eligible driver paired with a vehicle."""

    driver_id: str
    vehicle_id: str
    start_point: int  # index into SolverInput.matrix.points
    end_point: int
    weight_capacity_g: int
    volume_capacity_ml: int
    shift_start_s: int  # seconds from horizon start
    shift_end_s: int
    max_overtime_s: int = 0


class OrderNode(BaseModel):
    order_id: str
    point: int  # index into SolverInput.matrix.points
    weight_g: int
    volume_ml: int
    window_start_s: int
    window_end_s: int
    allowed_late_s: int = 0
    service_time_s: int
    priority: OrderPriority = OrderPriority.STANDARD
    # Re-optimisation locks: restrict which vehicles may serve this node.
    allowed_vehicles: list[int] | None = None


class SolverInput(BaseModel):
    horizon_start: datetime  # wall-clock instant that second 0 refers to
    vehicles: list[VehicleSpec]
    orders: list[OrderNode]
    matrix: TravelMatrix
    weights: ObjectiveWeights
    time_limit_seconds: int = 10
    # Initial solution hint (e.g. clusters or the previous plan's routes):
    # per-vehicle ordered lists of indices into ``orders``.
    initial_routes: list[list[int]] | None = None
    # Previous assignment (order_id -> vehicle index) used to count and
    # penalise unnecessary reassignments during re-optimisation.
    previous_assignment: dict[str, int] | None = None


class StopEstimate(BaseModel):
    order_id: str
    arrival_s: int
    departure_s: int
    late_s: int = 0


class VehicleRoute(BaseModel):
    vehicle_index: int
    driver_id: str
    vehicle_id: str
    stops: list[StopEstimate] = Field(default_factory=list)
    distance_m: float = 0.0
    duration_s: int = 0  # route end cumul - route start cumul, incl. service
    load_weight_g: int = 0
    load_volume_ml: int = 0
    overtime_s: int = 0


class SolverOutput(BaseModel):
    status: SolverStatus
    routes: list[VehicleRoute] = Field(default_factory=list)
    dropped_order_ids: list[str] = Field(default_factory=list)
    objective_value: int | None = None
    reassigned_order_ids: list[str] = Field(default_factory=list)
    solver_wall_time_s: float = 0.0
    error: str | None = None

"""Typed domain entities.

These Pydantic models are the canonical shapes exchanged between modules.
Persistence mappings live in ``aiviate.db.tables``; module logic must depend
on these types, not on ORM rows.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from aiviate.domain.enums import (
    DriverStatus,
    EventSeverity,
    EventType,
    OrderPriority,
    OrderStatus,
    PlanStatus,
    RouteStatus,
    SafetyStatus,
    SolverStatus,
    StopStatus,
    VehicleStatus,
)
from aiviate.domain.geo import Coordinate


def new_id() -> str:
    return uuid.uuid4().hex


def utc_now() -> datetime:
    """Naive UTC timestamp — all engine timestamps are stored naive-UTC."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


class _Entity(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @field_validator("*", mode="before")
    @classmethod
    def _normalise_datetimes(cls, value: Any) -> Any:
        if isinstance(value, datetime):
            return to_utc_naive(value)
        return value


class Organisation(_Entity):
    id: str = Field(default_factory=new_id)
    name: str
    timezone: str = "Africa/Johannesburg"
    operating_rules: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class Order(_Entity):
    id: str = Field(default_factory=new_id)
    organisation_id: str
    external_order_id: str
    customer_name: str
    customer_phone: str | None = None
    raw_address: str
    normalised_address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    geocoding_confidence: float | None = None
    package_weight: float  # kilograms
    package_volume: float  # cubic metres
    priority: OrderPriority = OrderPriority.STANDARD
    delivery_window_start: datetime
    delivery_window_end: datetime
    service_time_minutes: int = 5
    status: OrderStatus = OrderStatus.RECEIVED
    created_at: datetime = Field(default_factory=utc_now)

    @property
    def coordinate(self) -> Coordinate | None:
        if self.latitude is None or self.longitude is None:
            return None
        return Coordinate(latitude=self.latitude, longitude=self.longitude)


class Driver(_Entity):
    id: str = Field(default_factory=new_id)
    organisation_id: str
    name: str
    email: str
    status: DriverStatus = DriverStatus.AVAILABLE
    current_latitude: float | None = None
    current_longitude: float | None = None
    shift_start: datetime
    shift_end: datetime
    assigned_vehicle_id: str | None = None
    safety_status: SafetyStatus = SafetyStatus.NORMAL
    created_at: datetime = Field(default_factory=utc_now)

    @property
    def coordinate(self) -> Coordinate | None:
        if self.current_latitude is None or self.current_longitude is None:
            return None
        return Coordinate(latitude=self.current_latitude, longitude=self.current_longitude)


class Vehicle(_Entity):
    id: str = Field(default_factory=new_id)
    organisation_id: str
    registration_number: str
    vehicle_type: str = "van"
    maximum_weight: float  # kilograms
    maximum_volume: float  # cubic metres
    status: VehicleStatus = VehicleStatus.AVAILABLE
    device_id: str | None = None
    created_at: datetime = Field(default_factory=utc_now)


class DispatchPlan(_Entity):
    id: str = Field(default_factory=new_id)
    organisation_id: str
    planning_date: datetime
    status: PlanStatus = PlanStatus.DRAFT
    confidence_score: float | None = None
    total_distance: float | None = None  # kilometres
    total_duration: float | None = None  # minutes
    total_cost: float | None = None
    solver_status: SolverStatus | None = None
    previous_plan_id: str | None = None
    reason: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    approved_at: datetime | None = None


class Location(BaseModel):
    latitude: float
    longitude: float
    label: str | None = None


class Route(_Entity):
    id: str = Field(default_factory=new_id)
    plan_id: str
    driver_id: str
    vehicle_id: str
    status: RouteStatus = RouteStatus.PLANNED
    start_location: Location
    end_location: Location
    estimated_distance: float = 0.0  # kilometres
    estimated_duration: float = 0.0  # minutes
    capacity_usage: dict[str, float] = Field(default_factory=dict)


class RouteStop(_Entity):
    id: str = Field(default_factory=new_id)
    route_id: str
    order_id: str
    sequence_number: int
    estimated_arrival: datetime
    estimated_departure: datetime
    status: StopStatus = StopStatus.PENDING


class OperationalEvent(_Entity):
    id: str = Field(default_factory=new_id)
    organisation_id: str
    route_id: str | None = None
    driver_id: str | None = None
    vehicle_id: str | None = None
    event_type: EventType
    severity: EventSeverity = EventSeverity.INFO
    latitude: float | None = None
    longitude: float | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime = Field(default_factory=utc_now)
    processed_at: datetime | None = None


class DecisionAudit(_Entity):
    id: str = Field(default_factory=new_id)
    plan_id: str | None = None
    organisation_id: str
    decision_type: str
    input_snapshot: dict[str, Any] = Field(default_factory=dict)
    rules_applied: list[dict[str, Any]] = Field(default_factory=list)
    decision_result: dict[str, Any] = Field(default_factory=dict)
    explanation: str = ""
    created_at: datetime = Field(default_factory=utc_now)

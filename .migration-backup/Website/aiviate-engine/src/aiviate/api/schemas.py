"""Request/response schemas for the HTTP API."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from aiviate.domain.enums import EventSeverity, EventType, StopStatus


class OrderIn(BaseModel):
    external_order_id: str
    customer_name: str
    customer_phone: str | None = None
    raw_address: str
    latitude: float | None = None
    longitude: float | None = None
    package_weight: float
    package_volume: float
    priority: str = "standard"
    delivery_window_start: datetime
    delivery_window_end: datetime
    service_time_minutes: int = 5


class OrderImportIn(BaseModel):
    orders: list[OrderIn] = Field(min_length=1)


class PlanCreateIn(BaseModel):
    planning_date: datetime
    order_ids: list[str] | None = None
    time_limit_seconds: int = Field(default=10, ge=1, le=120)


class PlanRejectIn(BaseModel):
    note: str = ""


class ReoptimiseIn(BaseModel):
    reason: str
    route_id: str | None = None
    driver_id: str | None = None
    vehicle_id: str | None = None
    interrupt_active_stop: bool = False
    extra_order_ids: list[str] = Field(default_factory=list)
    delay_minutes: float = 0.0
    time_limit_seconds: int = Field(default=10, ge=1, le=120)


class StopPatchIn(BaseModel):
    status: StopStatus


class SafetyEventIn(BaseModel):
    event_type: EventType
    severity: EventSeverity = EventSeverity.WARNING
    route_id: str | None = None
    driver_id: str | None = None
    vehicle_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime | None = None

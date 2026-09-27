"""ORM tables. Column layout mirrors the domain entities in aiviate.domain.models.

IDs are 32-char hex UUIDs (portable across SQLite and PostgreSQL). Timestamps
are naive UTC. Coordinates are plain lat/lon float columns; when PostGIS is
available a geography column can be added in a follow-up migration without
changing engine code (all geo maths goes through aiviate.domain.geo and the
matrix providers).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from aiviate.db.base import Base
from aiviate.domain.models import new_id, utc_now


class OrganisationRow(Base):
    __tablename__ = "organisations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(64), default="Africa/Johannesburg")
    operating_rules: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    webhook_secret: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class OrderRow(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("organisation_id", "external_order_id", name="uq_order_external_id"),
        Index("ix_orders_org_status", "organisation_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    external_order_id: Mapped[str] = mapped_column(String(64))
    customer_name: Mapped[str] = mapped_column(String(255))
    customer_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    raw_address: Mapped[str] = mapped_column(Text)
    normalised_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    geocoding_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    geocoding_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    package_weight: Mapped[float] = mapped_column(Float)
    package_volume: Mapped[float] = mapped_column(Float)
    priority: Mapped[str] = mapped_column(String(16), default="standard")
    delivery_window_start: Mapped[datetime] = mapped_column(DateTime)
    delivery_window_end: Mapped[datetime] = mapped_column(DateTime)
    service_time_minutes: Mapped[int] = mapped_column(Integer, default=5)
    status: Mapped[str] = mapped_column(String(32), default="received")
    validation_errors: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class DriverRow(Base):
    __tablename__ = "drivers"
    __table_args__ = (Index("ix_drivers_org_status", "organisation_id", "status"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="available")
    current_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    shift_start: Mapped[datetime] = mapped_column(DateTime)
    shift_end: Mapped[datetime] = mapped_column(DateTime)
    assigned_vehicle_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    safety_status: Mapped[str] = mapped_column(String(32), default="normal")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class VehicleRow(Base):
    __tablename__ = "vehicles"
    __table_args__ = (
        UniqueConstraint("organisation_id", "registration_number", name="uq_vehicle_registration"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    registration_number: Mapped[str] = mapped_column(String(32))
    vehicle_type: Mapped[str] = mapped_column(String(32), default="van")
    maximum_weight: Mapped[float] = mapped_column(Float)
    maximum_volume: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), default="available")
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class DispatchPlanRow(Base):
    __tablename__ = "dispatch_plans"
    __table_args__ = (Index("ix_plans_org_status", "organisation_id", "status"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    planning_date: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_distance: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    solver_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    previous_plan_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class RouteRow(Base):
    __tablename__ = "routes"
    __table_args__ = (Index("ix_routes_plan", "plan_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    plan_id: Mapped[str] = mapped_column(ForeignKey("dispatch_plans.id"))
    driver_id: Mapped[str] = mapped_column(ForeignKey("drivers.id"))
    vehicle_id: Mapped[str] = mapped_column(ForeignKey("vehicles.id"))
    status: Mapped[str] = mapped_column(String(32), default="planned")
    start_location: Mapped[dict[str, Any]] = mapped_column(JSON)
    end_location: Mapped[dict[str, Any]] = mapped_column(JSON)
    estimated_distance: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_duration: Mapped[float] = mapped_column(Float, default=0.0)
    capacity_usage: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class RouteStopRow(Base):
    __tablename__ = "route_stops"
    __table_args__ = (
        UniqueConstraint("route_id", "sequence_number", name="uq_stop_sequence"),
        Index("ix_stops_route", "route_id"),
        Index("ix_stops_order", "order_id"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    route_id: Mapped[str] = mapped_column(ForeignKey("routes.id"))
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"))
    sequence_number: Mapped[int] = mapped_column(Integer)
    estimated_arrival: Mapped[datetime] = mapped_column(DateTime)
    estimated_departure: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(32), default="pending")


class OperationalEventRow(Base):
    __tablename__ = "operational_events"
    __table_args__ = (
        UniqueConstraint("organisation_id", "dedupe_key", name="uq_event_dedupe"),
        Index("ix_events_org_type", "organisation_id", "event_type"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    route_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    driver_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    vehicle_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    event_type: Mapped[str] = mapped_column(String(48))
    severity: Mapped[str] = mapped_column(String(16), default="info")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    dedupe_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    correlation_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class DecisionAuditRow(Base):
    __tablename__ = "decision_audits"
    __table_args__ = (Index("ix_audits_plan", "plan_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    plan_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    decision_type: Mapped[str] = mapped_column(String(48))
    input_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    rules_applied: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    decision_result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    explanation: Mapped[str] = mapped_column(Text, default="")
    correlation_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class GeocodeCacheRow(Base):
    __tablename__ = "geocode_cache"
    __table_args__ = (
        UniqueConstraint("provider", "normalised_address", name="uq_geocode_cache_key"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    provider: Mapped[str] = mapped_column(String(64))
    normalised_address: Mapped[str] = mapped_column(String(512))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float)
    provider_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class MatrixCacheRow(Base):
    __tablename__ = "matrix_cache"
    __table_args__ = (
        UniqueConstraint("provider", "origin_key", "destination_key", name="uq_matrix_cache_key"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    provider: Mapped[str] = mapped_column(String(64))
    origin_key: Mapped[str] = mapped_column(String(48))
    destination_key: Mapped[str] = mapped_column(String(48))
    distance_m: Mapped[float] = mapped_column(Float)
    duration_s: Mapped[float] = mapped_column(Float)
    geometry: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    is_fallback: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class AddressReviewRow(Base):
    __tablename__ = "address_reviews"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"))
    normalised_address: Mapped[str] = mapped_column(String(512))
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    reason: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|approved|rejected
    reviewed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class JobRow(Base):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_org_status", "organisation_id", "status"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organisation_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    job_type: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="queued")
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=2)
    correlation_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ApiKeyRow(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[str] = mapped_column(String(16))  # admin|dispatcher|driver|device
    driver_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    label: Mapped[str] = mapped_column(String(128), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class IdempotencyKeyRow(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("organisation_id", "endpoint", "key", name="uq_idempotency_key"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organisation_id: Mapped[str] = mapped_column(String(32))
    endpoint: Mapped[str] = mapped_column(String(128))
    key: Mapped[str] = mapped_column(String(128))
    request_hash: Mapped[str] = mapped_column(String(64))
    response_status: Mapped[int] = mapped_column(Integer)
    response_body: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

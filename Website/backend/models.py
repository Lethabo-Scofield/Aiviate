import os
import secrets
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine, Column, String, Float, Integer, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.pool import NullPool

import ssl as _ssl
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

DATABASE_URL = os.environ.get("NEON_DATABASE_URL") or os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("NEON_DATABASE_URL or DATABASE_URL environment variable is not set")

_parsed = urlparse(DATABASE_URL)
_params = parse_qs(_parsed.query)
_use_ssl = _params.pop("sslmode", [None])[0] in ("require", "verify-ca", "verify-full", None)
_params.pop("channel_binding", None)
_new_query = urlencode({k: v[0] for k, v in _params.items()})
DATABASE_URL = urlunparse(_parsed._replace(
    scheme="postgresql+pg8000",
    query=_new_query,
))

_connect_args = {}
if _use_ssl:
    _ssl_ctx = _ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = _ssl.CERT_NONE
    _connect_args["ssl_context"] = _ssl_ctx
_connect_args["timeout"] = int(os.environ.get("DB_CONNECT_TIMEOUT", "10"))

engine = create_engine(DATABASE_URL, poolclass=NullPool, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


class Company(Base):
    __tablename__ = "companies"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    domain = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    users = relationship("User", backref="company", lazy="select")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "domain": self.domain,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, default="admin")
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    driver_id = Column(String, ForeignKey("drivers.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "company_id": self.company_id,
            "company_name": self.company.name if self.company else None,
            "driver_id": self.driver_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, default="")
    vehicle_type = Column(String, default="van")
    status = Column(String, default="available")
    blocked = Column(Boolean, default=False)
    last_generated_password = Column(String, nullable=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=True)
    user_id = Column(String, nullable=True)
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    location_updated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "vehicle_type": self.vehicle_type,
            "status": self.status,
            "blocked": self.blocked or False,
            "has_account": bool(self.user_id),
            "current_lat": self.current_lat,
            "current_lng": self.current_lng,
            "location_updated_at": (
                self.location_updated_at.isoformat() if self.location_updated_at else None
            ),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Stop(Base):
    __tablename__ = "stops"

    id = Column(String, primary_key=True)
    order_id = Column(String)
    customer_name = Column(String)
    address = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    demand = Column(Integer, default=1)
    service_time = Column(Integer, default=15)
    phone = Column(String, default="")
    notes = Column(Text, default="")
    time_window_start = Column(String, default="")
    time_window_end = Column(String, default="")
    job_id = Column(String, ForeignKey("jobs.id"), nullable=True)
    stop_number = Column(Integer, default=0)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "customer_name": self.customer_name,
            "address": self.address,
            "lat": self.lat,
            "lng": self.lng,
            "demand": self.demand,
            "service_time": self.service_time,
            "phone": self.phone,
            "notes": self.notes,
            "time_window_start": self.time_window_start,
            "time_window_end": self.time_window_end,
            "job_id": self.job_id,
            "stop_number": self.stop_number,
            "completed": self.completed,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True)
    area = Column(String)
    total_stops = Column(Integer, default=0)
    total_distance_km = Column(Float, default=0)
    estimated_time_min = Column(Integer, default=0)
    estimated_cost = Column(Float, default=0)
    center_lat = Column(Float)
    center_lng = Column(Float)
    status = Column(String, default="unassigned")
    driver_id = Column(String, ForeignKey("drivers.id"), nullable=True)
    driver_name = Column(String, nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    route_geometry = Column(Text, nullable=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    stops = relationship("Stop", backref="job", lazy="joined", order_by="Stop.stop_number")

    def to_dict(self):
        return {
            "id": self.id,
            "area": self.area,
            "stops": [s.to_dict() for s in self.stops],
            "total_stops": self.total_stops,
            "total_distance_km": self.total_distance_km,
            "estimated_time_min": self.estimated_time_min,
            "estimated_cost": self.estimated_cost,
            "center_lat": self.center_lat,
            "center_lng": self.center_lng,
            "status": self.status,
            "driver_id": self.driver_id,
            "driver_name": self.driver_name,
            "route_geometry": self.route_geometry,
            "assigned_at": self.assigned_at.isoformat() if self.assigned_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Device(Base):
    __tablename__ = "devices"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    model = Column(String, default="Aiviate Mobile")
    status = Column(String, default="online")  # online / offline
    battery_pct = Column(Integer, default=100)
    signal_strength = Column(Integer, default=80)  # 0-100
    accel_status = Column(String, default="ok")  # ok / warning / error
    camera_status = Column(String, default="ok")  # ok / offline
    firmware_version = Column(String, default="1.0.0")
    ota_status = Column(String, default="up_to_date")  # up_to_date / update_available / updating
    last_seen = Column(DateTime, default=utcnow)
    driver_id = Column(String, ForeignKey("drivers.id"), nullable=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "model": self.model,
            "status": self.status,
            "battery_pct": self.battery_pct,
            "signal_strength": self.signal_strength,
            "accel_status": self.accel_status,
            "camera_status": self.camera_status,
            "firmware_version": self.firmware_version,
            "ota_status": self.ota_status,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "driver_id": self.driver_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True)
    type = Column(String, nullable=False)  # fatigue / route_deviation / delay / harsh_braking / speeding / device_offline / battery_low
    severity = Column(String, default="warning")  # critical / warning / info
    title = Column(String, nullable=False)
    message = Column(Text, default="")
    driver_id = Column(String, ForeignKey("drivers.id"), nullable=True)
    driver_name = Column(String, nullable=True)
    is_read = Column(Boolean, default=False)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "severity": self.severity,
            "title": self.title,
            "message": self.message,
            "driver_id": self.driver_id,
            "driver_name": self.driver_name,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SafetyEvent(Base):
    __tablename__ = "safety_events"

    id = Column(String, primary_key=True)
    driver_id = Column(String, ForeignKey("drivers.id"), nullable=False)
    event_type = Column(String, nullable=False)  # harsh_brake / speeding / fatigue / phone_use / sharp_turn
    severity = Column(Integer, default=1)  # 1 (minor) - 5 (critical)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    notes = Column(Text, default="")
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "driver_id": self.driver_id,
            "event_type": self.event_type,
            "severity": self.severity,
            "lat": self.lat,
            "lng": self.lng,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(String, primary_key=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    action_type = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    actor = Column(String, default="system")
    confidence = Column(Float, default=1.0)
    requires_approval = Column(Boolean, default=False)
    related_id = Column(String, nullable=True)
    details = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "company_id": self.company_id,
            "action_type": self.action_type,
            "summary": self.summary,
            "actor": self.actor,
            "confidence": self.confidence,
            "requires_approval": self.requires_approval,
            "related_id": self.related_id,
            "details": self.details or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AutopilotSettings(Base):
    __tablename__ = "autopilot_settings"

    company_id = Column(String, ForeignKey("companies.id"), primary_key=True)
    enabled = Column(Boolean, default=False)
    mode = Column(String, default="assist")  # manual / assist / autonomous / emergency
    max_actions_per_run = Column(Integer, default=5)
    auto_assign = Column(Boolean, default=True)
    auto_optimize = Column(Boolean, default=True)
    auto_notify = Column(Boolean, default=True)
    safety_approval_required = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "company_id": self.company_id,
            "enabled": bool(self.enabled),
            "mode": self.mode,
            "max_actions_per_run": self.max_actions_per_run,
            "auto_assign": bool(self.auto_assign),
            "auto_optimize": bool(self.auto_optimize),
            "auto_notify": bool(self.auto_notify),
            "safety_approval_required": bool(self.safety_approval_required),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class IntegrationSettings(Base):
    """Per-company display settings for the store orders integration."""
    __tablename__ = "integration_settings"

    company_id = Column(String, ForeignKey("companies.id"), primary_key=True)
    display_name = Column(String, nullable=True)
    logo = Column(Text, nullable=True)  # data URL (small, downscaled client-side)
    merchant_api_key_hash = Column(String, nullable=True)
    merchant_api_key_prefix = Column(String, nullable=True)
    merchant_api_key_created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            "company_id": self.company_id,
            "display_name": self.display_name or "Aiviate Operational Store",
            "logo": self.logo,
            "merchant_api_key_prefix": self.merchant_api_key_prefix,
            "merchant_api_key_created_at": (
                self.merchant_api_key_created_at.isoformat()
                if self.merchant_api_key_created_at else None
            ),
            "source": "operational_stops",
            "default": not bool(self.display_name or self.logo or self.merchant_api_key_hash),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    @staticmethod
    def new_merchant_api_key():
        return f"aiv_live_{secrets.token_urlsafe(32)}"


class PublicTrackingToken(Base):
    __tablename__ = "public_tracking_tokens"

    id = Column(String, primary_key=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    stop_id = Column(String, ForeignKey("stops.id"), nullable=False)
    token_hash = Column(String, nullable=False, unique=True)
    public_reference = Column(String, nullable=False)
    status = Column(String, default="active")
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    @staticmethod
    def default_expiry():
        return datetime.now(timezone.utc) + timedelta(days=30)

    def is_active(self):
        now = datetime.now(timezone.utc)
        expires_at = self.expires_at
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return self.status == "active" and not self.revoked_at and expires_at and expires_at > now

    def to_admin_dict(self):
        return {
            "id": self.id,
            "stop_id": self.stop_id,
            "public_reference": self.public_reference,
            "status": self.status,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


def init_db():
    Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

import os
from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, String, Float, Integer, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.pool import NullPool

import ssl as _ssl
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

DATABASE_URL = os.environ.get("NEON_DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("NEON_DATABASE_URL environment variable is not set")

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
    last_location_at = Column(DateTime, nullable=True)
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
            "last_location_at": self.last_location_at.isoformat() if self.last_location_at else None,
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
    status = Column(String, default="pending")  # pending | arrived | completed | failed
    failed_reason = Column(Text, nullable=True)
    arrived_at = Column(DateTime, nullable=True)
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
            "status": self.status or "pending",
            "failed_reason": self.failed_reason,
            "arrived_at": self.arrived_at.isoformat() if self.arrived_at else None,
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
    started_at = Column(DateTime, nullable=True)
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
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


def init_db():
    Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

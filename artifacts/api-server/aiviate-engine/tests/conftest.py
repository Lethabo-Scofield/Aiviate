"""Shared fixtures: in-memory database, organisation, drivers, vehicles, orders.

All fixtures are deterministic; anything random uses a fixed seed.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from aiviate.db.base import Base
from aiviate.db import tables as t  # noqa: F401 — register tables
from aiviate.domain import models as m
from aiviate.domain.enums import OrderPriority
from aiviate.rules import OperatingRules, resolve_rules

# Pilot service area (test fixture only — production reads this from
# organisation configuration, never from code).
PILOT_SERVICE_AREA = {
    "min_latitude": -26.6,
    "max_latitude": -25.5,
    "min_longitude": 27.6,
    "max_longitude": 28.5,
}
DEPOT = {"latitude": -26.1438, "longitude": 28.0406}  # test depot near Johannesburg CBD

PLANNING_DAY = datetime(2026, 7, 6)


def pilot_rules_doc() -> dict:
    return {
        "geocoding": {"minimum_confidence": 0.85, "service_area": PILOT_SERVICE_AREA},
        "depots": [DEPOT],
    }


@pytest.fixture()
def engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def session(engine) -> Iterator[Session]:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    session = factory()
    yield session
    session.close()


@pytest.fixture()
def organisation(session: Session) -> m.Organisation:
    org = m.Organisation(name="Pilot Logistics", operating_rules=pilot_rules_doc())
    session.add(t.OrganisationRow(**org.model_dump(), webhook_secret="test-webhook-secret"))
    session.commit()
    return org


@pytest.fixture()
def rules(organisation: m.Organisation) -> OperatingRules:
    return resolve_rules(organisation.operating_rules)


def make_driver(org_id: str, name: str, lat: float, lon: float, **overrides) -> m.Driver:
    defaults = dict(
        organisation_id=org_id,
        name=name,
        email=f"{name.lower().replace(' ', '.')}@pilot.example",
        current_latitude=lat,
        current_longitude=lon,
        shift_start=PLANNING_DAY.replace(hour=7),
        shift_end=PLANNING_DAY.replace(hour=17),
    )
    defaults.update(overrides)
    return m.Driver(**defaults)


def make_vehicle(org_id: str, registration: str, **overrides) -> m.Vehicle:
    defaults = dict(
        organisation_id=org_id,
        registration_number=registration,
        maximum_weight=800.0,
        maximum_volume=6.0,
    )
    defaults.update(overrides)
    return m.Vehicle(**defaults)


def make_order(org_id: str, external_id: str, lat: float, lon: float, **overrides) -> m.Order:
    defaults = dict(
        organisation_id=org_id,
        external_order_id=external_id,
        customer_name=f"Customer {external_id}",
        customer_phone="+27110000000",
        raw_address=f"{external_id} Test Street",
        normalised_address=f"{external_id} test street",
        latitude=lat,
        longitude=lon,
        geocoding_confidence=0.95,
        package_weight=20.0,
        package_volume=0.2,
        priority=OrderPriority.STANDARD,
        delivery_window_start=PLANNING_DAY.replace(hour=8),
        delivery_window_end=PLANNING_DAY.replace(hour=16),
        service_time_minutes=5,
        status="ready",
    )
    defaults.update(overrides)
    return m.Order(**defaults)

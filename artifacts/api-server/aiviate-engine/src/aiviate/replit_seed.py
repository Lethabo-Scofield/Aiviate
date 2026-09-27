"""Idempotent seeding for the Replit-hosted engine.

Creates one organisation, a small fleet and a single admin API key so the
co-located Flask backend can talk to the engine over HTTP. The API key is
persisted (once) to a gitignored file at the workspace root and reused across
restarts; only its hash is stored in the database.

Business configuration is deliberately permissive here: a global service area
and always-on driver shifts so that stops from anywhere in the world validate
and can be planned. The depot is updated per request by the Flask proxy (see
the ``/api/v1/config/depot`` endpoint).
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from aiviate.api.deps import hash_key
from aiviate.config import get_settings
from aiviate.db import tables as t
from aiviate.db.base import Base, _make_engine
from aiviate.domain import models as m

ORG_NAME = "Aiviate Dispatch"
KEY_FILE = Path(__file__).resolve().parents[3] / ".aiviate_engine_key"

_GLOBAL_RULES = {
    "geocoding": {
        "minimum_confidence": 0.0,
        "service_area": {
            "min_latitude": -90.0,
            "max_latitude": 90.0,
            "min_longitude": -180.0,
            "max_longitude": 180.0,
        },
    },
    # Placeholder depot; overwritten per planning request with the batch centroid.
    "depots": [{"latitude": -26.1438, "longitude": 28.0406}],
    # Generous lateness grace so the solver assigns rather than drops stops.
    "allowed_late_minutes": 720,
    "max_overtime_minutes": 600,
}

# Always-on shift window so drivers are eligible on any planning date.
_SHIFT_START = datetime(2020, 1, 1, 0, 0, 0)
_SHIFT_END = datetime(2100, 1, 1, 0, 0, 0)


def _read_or_create_key() -> str:
    if KEY_FILE.exists():
        existing = KEY_FILE.read_text().strip()
        if existing:
            return existing
    key = f"aiv_{secrets.token_hex(24)}"
    KEY_FILE.write_text(key)
    try:
        os.chmod(KEY_FILE, 0o600)
    except OSError:
        pass
    return key


def _seed_fleet(session, organisation_id: str, count: int = 3) -> None:
    for i in range(1, count + 1):
        vehicle = m.Vehicle(
            organisation_id=organisation_id,
            registration_number=f"AIV-{i:03d}",
            maximum_weight=1500.0,
            maximum_volume=12.0,
            device_id=f"device-{i}",
        )
        session.add(t.VehicleRow(**vehicle.model_dump()))
        driver = m.Driver(
            organisation_id=organisation_id,
            name=f"Driver {i}",
            email=f"driver{i}@aiviate.example",
            shift_start=_SHIFT_START,
            shift_end=_SHIFT_END,
            assigned_vehicle_id=vehicle.id,
        )
        session.add(t.DriverRow(**driver.model_dump()))


def ensure_seed() -> tuple[str, str]:
    """Create org/fleet/key if missing. Returns (organisation_id, api_key)."""
    settings = get_settings()
    engine = _make_engine(settings.database_url, echo=False)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)

    api_key = _read_or_create_key()
    key_hash = hash_key(api_key)

    with session_factory() as session:
        org_row = session.execute(
            select(t.OrganisationRow).where(t.OrganisationRow.name == ORG_NAME)
        ).scalar_one_or_none()

        if org_row is None:
            org = m.Organisation(name=ORG_NAME, operating_rules=_GLOBAL_RULES)
            org_row = t.OrganisationRow(
                **org.model_dump(), webhook_secret=secrets.token_hex(24)
            )
            session.add(org_row)
            session.flush()
            _seed_fleet(session, org_row.id)

        existing_key = session.execute(
            select(t.ApiKeyRow).where(t.ApiKeyRow.key_hash == key_hash)
        ).scalar_one_or_none()
        if existing_key is None:
            session.add(
                t.ApiKeyRow(
                    organisation_id=org_row.id,
                    key_hash=key_hash,
                    role="admin",
                    label="replit-backend",
                )
            )

        organisation_id = org_row.id
        session.commit()

    return organisation_id, api_key

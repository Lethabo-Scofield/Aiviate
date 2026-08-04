"""Local bootstrap: create an organisation, fleet and API keys.

    python -m aiviate.bootstrap --name "Pilot Logistics"

Prints the generated API keys once — only their hashes are stored.
"""

from __future__ import annotations

import argparse
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import sessionmaker

from aiviate.api.deps import hash_key
from aiviate.config import get_settings
from aiviate.db import tables as t
from aiviate.db.base import Base, _make_engine
from aiviate.domain import models as m


def bootstrap(name: str, drivers: int = 3, vehicles: int = 3) -> dict:
    settings = get_settings()
    engine = _make_engine(settings.database_url, echo=False)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()

    org = m.Organisation(
        name=name,
        operating_rules={
            # Pilot service area and depot are configuration, not code.
            "geocoding": {
                "service_area": {
                    "min_latitude": -26.6, "max_latitude": -25.5,
                    "min_longitude": 27.6, "max_longitude": 28.5,
                }
            },
            "depots": [{"latitude": -26.1438, "longitude": 28.0406}],
        },
    )
    webhook_secret = secrets.token_hex(24)
    session.add(t.OrganisationRow(**org.model_dump(), webhook_secret=webhook_secret))
    session.flush()  # rows below reference the organisation by FK

    keys: dict[str, str] = {}

    def add_key(role: str, label: str, driver_id: str | None = None,
                device_id: str | None = None) -> None:
        raw = f"aiv_{secrets.token_hex(24)}"
        session.add(t.ApiKeyRow(organisation_id=org.id, key_hash=hash_key(raw), role=role,
                                driver_id=driver_id, device_id=device_id, label=label))
        keys[label] = raw

    add_key("admin", "admin")
    add_key("dispatcher", "dispatcher")

    shift_start = datetime.utcnow().replace(hour=7, minute=0, second=0, microsecond=0)
    for i in range(1, drivers + 1):
        vehicle = m.Vehicle(organisation_id=org.id, registration_number=f"AIV-{i:03d}-GP",
                            maximum_weight=800.0, maximum_volume=6.0, device_id=f"device-{i}")
        session.add(t.VehicleRow(**vehicle.model_dump()))
        driver = m.Driver(
            organisation_id=org.id, name=f"Driver {i}", email=f"driver{i}@{name.lower()}.example",
            shift_start=shift_start, shift_end=shift_start + timedelta(hours=10),
            assigned_vehicle_id=vehicle.id,
        )
        session.add(t.DriverRow(**driver.model_dump()))
        add_key("driver", f"driver-{i}", driver_id=driver.id)
        add_key("device", f"device-{i}", device_id=vehicle.device_id)

    session.commit()
    session.close()
    return {"organisation_id": org.id, "webhook_secret": webhook_secret, "api_keys": keys}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="Pilot Logistics")
    parser.add_argument("--drivers", type=int, default=3)
    args = parser.parse_args()
    result = bootstrap(args.name, drivers=args.drivers, vehicles=args.drivers)
    print(f"organisation_id: {result['organisation_id']}")
    print(f"webhook_secret:  {result['webhook_secret']}")
    for label, key in result["api_keys"].items():
        print(f"api key [{label}]: {key}")

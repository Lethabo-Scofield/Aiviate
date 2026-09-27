import json
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from math import radians, sin, cos, sqrt, atan2

import jwt
from sqlalchemy import text
from config import JWT_SECRET

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def generate_token(user):
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": user.id,
        "company_id": user.company_id,
        "email": user.email,
        "role": user.role,
        "driver_id": user.driver_id,
        "exp": now + timedelta(days=30),
        "iat": now,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def cluster_stops(stops, radius_km=8):
    clusters = []
    used = set()
    sorted_stops = sorted(stops, key=lambda s: (s["lat"], s["lng"]))
    for i, stop in enumerate(sorted_stops):
        if i in used:
            continue
        cluster = [stop]
        used.add(i)
        for j, other in enumerate(sorted_stops):
            if j in used:
                continue
            dist = haversine(stop["lat"], stop["lng"], other["lat"], other["lng"])
            if dist <= radius_km:
                cluster.append(other)
                used.add(j)
        clusters.append(cluster)
    return clusters


def load_area_definitions():
    filepath = os.path.join(DATA_DIR, "areas.json")
    with open(filepath, "r") as f:
        return json.load(f)


def determine_area_name(lat, lng):
    areas = load_area_definitions()
    best = "Zone"
    best_dist = float("inf")
    for area in areas:
        d = haversine(lat, lng, area["lat"], area["lng"])
        if d < best_dist:
            best_dist = d
            best = area["name"]

    if best_dist > 15:
        best = f"Area ({round(lat, 2)}, {round(lng, 2)})"

    return best


def get_db_session():
    from models import SessionLocal
    return SessionLocal()


def record_domain_event(
    db,
    table_name,
    company_id,
    *,
    status="active",
    external_ref=None,
    correlation_id=None,
    source=None,
    payload=None,
    occurred_at=None,
):
    """Persist a row into one of the expanded operational domain tables."""
    if not re.match(r"^[a-z][a-z0-9_]*$", table_name):
        raise ValueError("Invalid domain table name")

    db.execute(
        text(f"""
            INSERT INTO {table_name}
              (id, company_id, status, external_ref, correlation_id, source, payload, occurred_at)
            VALUES
              (:id, :company_id, :status, :external_ref, :correlation_id, :source,
               CAST(:payload AS JSONB), :occurred_at)
        """),
        {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "status": status,
            "external_ref": external_ref,
            "correlation_id": correlation_id,
            "source": source,
            "payload": json.dumps(payload or {}),
            "occurred_at": occurred_at or datetime.now(timezone.utc),
        },
    )

import json
import os
from datetime import datetime, timedelta, timezone
from math import radians, sin, cos, sqrt, atan2

import jwt
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

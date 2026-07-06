"""Server-side client for the Aiviate decision engine (OR-Tools).

The engine runs as a separate local service. Only this backend talks to it,
using an admin API key read from a gitignored file at the workspace root. The
browser never sees the key or calls the engine directly.
"""

import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

ENGINE_URL = os.environ.get("ENGINE_URL", "http://localhost:8080").rstrip("/")
_KEY_FILE = Path(__file__).resolve().parents[1] / ".aiviate_engine_key"

# Minimum separation (degrees) between distinct points so the engine's matrix
# cache never sees two identical coordinate keys in one batch (~11m).
_EPSILON = 1e-4


class EngineError(Exception):
    """Raised for expected, user-facing engine problems."""


def _api_key():
    if not _KEY_FILE.exists():
        raise EngineError("The AI Planner engine is still starting up. Try again in a moment.")
    key = _KEY_FILE.read_text().strip()
    if not key:
        raise EngineError("The AI Planner engine key is missing.")
    return key


def _headers():
    return {"X-API-Key": _api_key(), "Content-Type": "application/json"}


def health():
    try:
        resp = requests.get(f"{ENGINE_URL}/healthz", timeout=4)
        return resp.ok
    except requests.RequestException:
        return False


def _set_depot(latitude, longitude):
    resp = requests.put(
        f"{ENGINE_URL}/api/v1/config/depot",
        json={"latitude": latitude, "longitude": longitude},
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()


def _create_order(payload):
    resp = requests.post(
        f"{ENGINE_URL}/api/v1/orders", json=payload, headers=_headers(), timeout=30
    )
    resp.raise_for_status()
    return resp.json()


def _create_plan(order_ids, planning_date_iso, time_limit=8):
    resp = requests.post(
        f"{ENGINE_URL}/api/v1/dispatch/plans",
        json={
            "planning_date": planning_date_iso,
            "order_ids": order_ids,
            "time_limit_seconds": time_limit,
        },
        headers=_headers(),
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _get_job(job_id):
    resp = requests.get(
        f"{ENGINE_URL}/api/v1/dispatch/plans/jobs/{job_id}", headers=_headers(), timeout=15
    )
    resp.raise_for_status()
    return resp.json()


def _get_plan(plan_id):
    resp = requests.get(
        f"{ENGINE_URL}/api/v1/dispatch/plans/{plan_id}", headers=_headers(), timeout=30
    )
    resp.raise_for_status()
    return resp.json()


def _unique_coordinates(valid):
    """Return coords per stop, nudging any that collide at 5-decimal precision."""
    used = set()
    coords = []
    for stop in valid:
        lat = float(stop["lat"])
        lng = float(stop["lng"])
        bump = 0
        while (round(lat, 5), round(lng, 5)) in used:
            bump += 1
            lat = float(stop["lat"]) + _EPSILON * bump
            lng = float(stop["lng"]) + _EPSILON * bump
        used.add((round(lat, 5), round(lng, 5)))
        coords.append((lat, lng))
    return coords, used


def optimize_stops(stops):
    """Plan routes for the given stops via the engine.

    ``stops`` is a list of dicts (Stop.to_dict()). Returns a JSON-serialisable
    plan summary keyed back to the original stops.
    """
    valid = [s for s in stops if s.get("lat") is not None and s.get("lng") is not None]
    if len(valid) < 2:
        raise EngineError("Need at least 2 geocoded stops to build a plan.")

    coords, used_keys = _unique_coordinates(valid)

    # Depot = centroid of the batch, nudged if it collides with any stop.
    depot_lat = sum(c[0] for c in coords) / len(coords)
    depot_lng = sum(c[1] for c in coords) / len(coords)
    while (round(depot_lat, 5), round(depot_lng, 5)) in used_keys:
        depot_lat += _EPSILON
        depot_lng += _EPSILON
    _set_depot(depot_lat, depot_lng)

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    window_start = today.isoformat()
    window_end = (today + timedelta(days=1)).isoformat()
    run_id = f"{int(time.time())}"

    id_map = {}
    order_ids = []
    for stop, (lat, lng) in zip(valid, coords):
        payload = {
            "external_order_id": f"{run_id}-{stop['id']}",
            "customer_name": stop.get("customer_name") or "Customer",
            "raw_address": stop.get("address") or "Delivery stop",
            "latitude": lat,
            "longitude": lng,
            "package_weight": float(stop.get("demand") or 1),
            "package_volume": 0.01,
            "priority": "standard",
            "delivery_window_start": window_start,
            "delivery_window_end": window_end,
            "service_time_minutes": int(stop.get("service_time") or 5),
        }
        result = _create_order(payload)
        order_id = result.get("order_id")
        if order_id:
            order_ids.append(order_id)
            id_map[order_id] = stop

    if len(order_ids) < 2:
        raise EngineError("The engine could not accept enough valid stops to plan a route.")

    job = _create_plan(order_ids, today.isoformat())
    job = _await_job(job)

    result = job.get("result") or {}
    plan_id = result.get("plan_id")
    if not plan_id:
        raise EngineError(job.get("error") or "The planner did not return a plan.")

    plan = _get_plan(plan_id)
    return _shape_plan(plan, result, id_map)


def _await_job(job, attempts=30, delay=1.0):
    status = job.get("status")
    if status in ("completed", "failed"):
        return job
    job_id = job.get("job_id")
    if not job_id:
        return job
    for _ in range(attempts):
        job = _get_job(job_id)
        if job.get("status") in ("completed", "failed"):
            return job
        time.sleep(delay)
    return job


def _shape_plan(plan, result, id_map):
    plan_obj = plan.get("plan") or {}
    routes_in = plan.get("routes") or []

    routes_out = []
    total_distance = 0.0
    total_duration = 0.0
    for idx, route in enumerate(routes_in, start=1):
        distance_m = route.get("estimated_distance") or 0
        duration_s = route.get("estimated_duration") or 0
        total_distance += distance_m
        total_duration += duration_s
        stops_out = []
        for rs in route.get("stops") or []:
            original = id_map.get(rs.get("order_id"))
            stops_out.append(
                {
                    "sequence": rs.get("sequence_number"),
                    "order_id": rs.get("order_id"),
                    "customer_name": (original or {}).get("customer_name"),
                    "address": (original or {}).get("address"),
                    "lat": (original or {}).get("lat"),
                    "lng": (original or {}).get("lng"),
                    "eta": rs.get("estimated_arrival"),
                }
            )
        routes_out.append(
            {
                "route_number": idx,
                "distance_km": round(distance_m / 1000, 1),
                "duration_min": round(duration_s / 60),
                "capacity_usage": route.get("capacity_usage"),
                "stops": stops_out,
            }
        )

    unassigned_ids = result.get("unassigned_order_ids") or []
    unassigned = []
    for oid in unassigned_ids:
        original = id_map.get(oid)
        if original:
            unassigned.append(
                {
                    "customer_name": original.get("customer_name"),
                    "address": original.get("address"),
                }
            )

    return {
        "success": True,
        "plan_id": plan_obj.get("id"),
        "plan_status": plan_obj.get("status") or result.get("plan_status"),
        "solver_status": result.get("solver_status"),
        "confidence": result.get("confidence"),
        "total_distance_km": round(total_distance / 1000, 1),
        "total_duration_min": round(total_duration / 60),
        "total_stops_planned": sum(len(r["stops"]) for r in routes_out),
        "routes": routes_out,
        "unassigned": unassigned,
    }

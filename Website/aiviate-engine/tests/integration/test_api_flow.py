"""API integration tests: import → plan → approve → drive → safety → re-opt."""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from aiviate.api.app import create_app
from aiviate.api.deps import hash_key
from aiviate.config import Settings
from aiviate.db import tables as t
from aiviate.domain import models as m

WEBHOOK_SECRET = "integration-secret"
PLANNING_DAY = "2026-07-06T00:00:00"

# Pilot config as data (depot + service area), never engine code.
RULES = {
    "geocoding": {
        "service_area": {"min_latitude": -26.6, "max_latitude": -25.5,
                         "min_longitude": 27.6, "max_longitude": 28.5}
    },
    "depots": [{"latitude": -26.1438, "longitude": 28.0406}],
}


@pytest.fixture()
def api(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'api.db'}",
        jobs_eager=True,
        geocoding_provider="local",
        matrix_provider="haversine",
        log_json=False,
    )
    app = create_app(settings)
    client = TestClient(app)

    session = app.state.session_factory()
    org = m.Organisation(name="API Org", operating_rules=RULES)
    session.add(t.OrganisationRow(**org.model_dump(), webhook_secret=WEBHOOK_SECRET))
    session.flush()  # rows below reference the organisation by FK
    keys = {}
    for label, role, extra in [
        ("admin", "admin", {}),
        ("dispatcher", "dispatcher", {}),
        ("device", "device", {"device_id": "device-1"}),
    ]:
        raw = f"key-{label}"
        session.add(t.ApiKeyRow(organisation_id=org.id, key_hash=hash_key(raw),
                                role=role, label=label, **extra))
        keys[label] = raw

    drivers, vehicles = [], []
    from datetime import datetime

    for i in range(1, 4):
        vehicle = m.Vehicle(organisation_id=org.id, registration_number=f"API-{i:03d}",
                            maximum_weight=800, maximum_volume=6.0, device_id=f"device-{i}")
        session.add(t.VehicleRow(**vehicle.model_dump()))
        driver = m.Driver(
            organisation_id=org.id, name=f"Driver {i}", email=f"d{i}@api.example",
            shift_start=datetime(2026, 7, 6, 7), shift_end=datetime(2026, 7, 6, 17),
            assigned_vehicle_id=vehicle.id,
            current_latitude=-26.14, current_longitude=28.04,
        )
        session.add(t.DriverRow(**driver.model_dump()))
        raw = f"key-driver-{i}"
        session.add(t.ApiKeyRow(organisation_id=org.id, key_hash=hash_key(raw),
                                role="driver", driver_id=driver.id, label=f"driver-{i}"))
        keys[f"driver-{i}"] = raw
        drivers.append(driver)
        vehicles.append(vehicle)
    session.commit()
    session.close()
    return client, keys, org, drivers, vehicles


def auth(keys, label):
    return {"X-API-Key": keys[label]}


def order_payload(i: int, lat: float, lon: float) -> dict:
    return {
        "external_order_id": f"API-ORD-{i:03d}",
        "customer_name": f"Customer {i}",
        "raw_address": f"{i} Integration Road",
        "latitude": lat,
        "longitude": lon,
        "package_weight": 20.0,
        "package_volume": 0.2,
        "priority": "standard",
        "delivery_window_start": "2026-07-06T08:00:00",
        "delivery_window_end": "2026-07-06T16:00:00",
        "service_time_minutes": 5,
    }


def import_orders(client, keys, count=9, signed=False, idempotency_key="import-1"):
    centres = [(-26.2041, 28.0473), (-26.2678, 27.8585), (-25.7479, 28.2293)]
    body = {
        "orders": [
            order_payload(i, centres[i % 3][0] + 0.001 * i, centres[i % 3][1] - 0.001 * i)
            for i in range(count)
        ]
    }
    headers = {**auth(keys, "dispatcher"), "Idempotency-Key": idempotency_key}
    if signed:
        raw = json.dumps(body).encode()
        headers["X-Webhook-Signature"] = hmac.new(
            WEBHOOK_SECRET.encode(), raw, hashlib.sha256
        ).hexdigest()
        return client.post("/api/v1/orders/import", content=raw, headers={
            **headers, "Content-Type": "application/json"})
    return client.post("/api/v1/orders/import", json=body, headers=headers)


def create_and_approve_plan(client, keys):
    response = client.post(
        "/api/v1/dispatch/plans",
        json={"planning_date": PLANNING_DAY, "time_limit_seconds": 3},
        headers={**auth(keys, "dispatcher"), "Idempotency-Key": "plan-1"},
    )
    assert response.status_code == 202, response.text
    job = response.json()
    assert job["status"] == "completed", job
    plan_id = job["result"]["plan_id"]
    approve = client.post(f"/api/v1/dispatch/plans/{plan_id}/approve", headers=auth(keys, "admin"))
    assert approve.status_code == 200, approve.text
    return plan_id


def test_unauthenticated_requests_rejected(api):
    client, keys, *_ = api
    assert client.get("/api/v1/orders").status_code == 401
    assert client.get("/api/v1/orders", headers={"X-API-Key": "nonsense"}).status_code == 401


def test_import_to_approved_plan(api):
    client, keys, org, drivers, vehicles = api
    response = import_orders(client, keys)
    assert response.status_code == 200
    job = response.json()
    assert job["status"] == "completed"
    assert job["result"]["accepted"] == 9
    assert job["result"]["invalid"] == 0

    # Idempotent replay returns the stored response without re-importing.
    replay = import_orders(client, keys)
    assert replay.json()["job_id"] == job["job_id"]

    plan_id = create_and_approve_plan(client, keys)
    detail = client.get(f"/api/v1/dispatch/plans/{plan_id}", headers=auth(keys, "dispatcher"))
    assert detail.status_code == 200
    body = detail.json()
    assert body["plan"]["status"] == "published"
    assert len(body["routes"]) >= 1
    stop_count = sum(len(r["stops"]) for r in body["routes"])
    assert stop_count == 9

    explanation = client.get(f"/api/v1/plans/{plan_id}/explanation",
                             headers=auth(keys, "dispatcher"))
    assert explanation.status_code == 200
    types = [d["decision_type"] for d in explanation.json()["decisions"]]
    assert "plan_created" in types and "plan_approved" in types


def test_signed_webhook_import(api):
    client, keys, *_ = api
    ok = import_orders(client, keys, count=3, signed=True, idempotency_key="hook-1")
    assert ok.status_code == 200

    # Tampered signature is rejected.
    body = {"orders": [order_payload(99, -26.2, 28.0)]}
    bad = client.post(
        "/api/v1/orders/import", json=body,
        headers={**auth(keys, "dispatcher"), "X-Webhook-Signature": "deadbeef",
                 "Idempotency-Key": "hook-2"},
    )
    assert bad.status_code == 401


def test_invalid_orders_reported_not_imported(api):
    client, keys, *_ = api
    payload = order_payload(1, -26.2, 28.0)
    payload["delivery_window_end"] = "2026-07-06T06:00:00"  # ends before start
    response = client.post("/api/v1/orders", json=payload, headers=auth(keys, "dispatcher"))
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "invalid"
    assert body["errors"][0]["code"] == "WINDOW_END_BEFORE_START"
    listed = client.get("/api/v1/orders?status=ready", headers=auth(keys, "dispatcher")).json()
    assert listed["orders"] == []


def test_driver_route_access_and_stop_updates(api):
    client, keys, org, drivers, vehicles = api
    import_orders(client, keys)
    create_and_approve_plan(client, keys)

    # Find a driver with a route.
    route = None
    driver_label = None
    for i, driver in enumerate(drivers, start=1):
        response = client.get(f"/api/v1/drivers/{driver.id}/active-route",
                              headers=auth(keys, f"driver-{i}"))
        if response.status_code == 200:
            route = response.json()
            driver_label = f"driver-{i}"
            break
    assert route is not None, "no driver has an active route"

    # Another driver may not read it.
    other_label = next(f"driver-{i}" for i, d in enumerate(drivers, start=1)
                       if f"driver-{i}" != driver_label)
    route_driver_id = route["route"]["driver_id"]
    forbidden = client.get(f"/api/v1/drivers/{route_driver_id}/active-route",
                           headers=auth(keys, other_label))
    assert forbidden.status_code == 403

    # Stop workflow: pending → active → completed, idempotently.
    route_id = route["route"]["id"]
    first_stop = route["stops"][0]
    url = f"/api/v1/routes/{route_id}/stops/{first_stop['id']}"
    activate = client.patch(url, json={"status": "active"},
                            headers={**auth(keys, driver_label), "Idempotency-Key": "s1"})
    assert activate.status_code == 200
    assert activate.json()["route_status"] == "active"
    complete = client.patch(url, json={"status": "completed"},
                            headers={**auth(keys, driver_label), "Idempotency-Key": "s2"})
    assert complete.status_code == 200
    # Replay of the same update is a no-op returning the stored response.
    replay = client.patch(url, json={"status": "completed"},
                          headers={**auth(keys, driver_label), "Idempotency-Key": "s2"})
    assert replay.status_code == 200
    # Completed stops are immutable.
    illegal = client.patch(url, json={"status": "active"},
                           headers={**auth(keys, driver_label), "Idempotency-Key": "s3"})
    assert illegal.status_code == 409


def test_safety_event_suspends_route_and_reoptimises(api):
    client, keys, org, drivers, vehicles = api
    import_orders(client, keys)
    plan_id = create_and_approve_plan(client, keys)
    detail = client.get(f"/api/v1/dispatch/plans/{plan_id}",
                        headers=auth(keys, "dispatcher")).json()
    route = max(detail["routes"], key=lambda r: len(r["stops"]))

    event = {
        "event_type": "ACCIDENT_CONFIRMED",
        "severity": "critical",
        "route_id": route["id"],
        "driver_id": route["driver_id"],
        "vehicle_id": route["vehicle_id"],
    }
    response = client.post("/api/v1/events/safety", json=event,
                           headers={**auth(keys, "device"), "Idempotency-Key": "acc-1"})
    assert response.status_code == 202, response.text
    body = response.json()
    assert body["route_status"] == "suspended"
    assert body["driver_safety_status"] == "blocked"
    assert body["returned_order_ids"]
    assert body["reoptimisation_job_id"] is not None

    # Replay is deduplicated.
    again = client.post("/api/v1/events/safety", json=event,
                        headers={**auth(keys, "device"), "Idempotency-Key": "acc-1"})
    assert again.json()["duplicate"] is True

    # The re-optimisation job produced a replacement plan without the blocked driver.
    job = client.get(f"/api/v1/jobs/{body['reoptimisation_job_id']}",
                     headers=auth(keys, "dispatcher")).json()
    assert job["status"] == "completed", job
    new_plan_id = job["result"]["new_plan_id"]
    new_detail = client.get(f"/api/v1/dispatch/plans/{new_plan_id}",
                            headers=auth(keys, "dispatcher")).json()
    assert all(r["driver_id"] != route["driver_id"] for r in new_detail["routes"])

    events = client.get("/api/v1/events", headers=auth(keys, "dispatcher")).json()
    assert any(e["event_type"] == "ACCIDENT_CONFIRMED" for e in events["events"])


def test_tenant_isolation_between_organisations(api, tmp_path):
    client, keys, org, drivers, vehicles = api
    # Second organisation with its own key.
    session = client.app.state.session_factory()
    rival = m.Organisation(name="Rival Org", operating_rules=RULES)
    session.add(t.OrganisationRow(**rival.model_dump(), webhook_secret="other"))
    session.flush()
    session.add(t.ApiKeyRow(organisation_id=rival.id, key_hash=hash_key("rival-admin"),
                            role="admin", label="rival"))
    session.commit()
    session.close()

    import_orders(client, keys, count=3, idempotency_key="iso-1")
    plan_id = create_and_approve_plan(client, keys)

    rival_headers = {"X-API-Key": "rival-admin"}
    assert client.get("/api/v1/orders", headers=rival_headers).json()["orders"] == []
    assert client.get(f"/api/v1/dispatch/plans/{plan_id}", headers=rival_headers).status_code == 404
    assert client.get(f"/api/v1/plans/{plan_id}/explanation",
                      headers=rival_headers).status_code == 404


def test_driver_cannot_approve_plans(api):
    client, keys, *_ = api
    import_orders(client, keys, count=3, idempotency_key="rbac-1")
    response = client.post(
        "/api/v1/dispatch/plans",
        json={"planning_date": PLANNING_DAY, "time_limit_seconds": 2},
        headers={**auth(keys, "dispatcher"), "Idempotency-Key": "rbac-plan"},
    )
    plan_id = response.json()["result"]["plan_id"]
    denied = client.post(f"/api/v1/dispatch/plans/{plan_id}/approve",
                         headers=auth(keys, "driver-1"))
    assert denied.status_code == 403
    # Dispatcher cannot approve either — admin only.
    denied2 = client.post(f"/api/v1/dispatch/plans/{plan_id}/approve",
                          headers=auth(keys, "dispatcher"))
    assert denied2.status_code == 403

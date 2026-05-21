"""Demo data seeding for Aiviate. Generates realistic devices, alerts, and safety events.

Registered in app.py via the auth_bp blueprint (kept inline here for simplicity)."""

import uuid
import random
from datetime import datetime, timezone, timedelta

from flask import jsonify, g

from routes import auth_bp
from middleware import require_auth, require_admin
from models import Device, Alert, SafetyEvent, Driver
from utils import get_db_session


# Johannesburg neighbourhoods used for demo telemetry
JHB_POINTS = [
    ("Sandton", -26.1076, 28.0567),
    ("Soweto", -26.2678, 27.8585),
    ("Bedfordview", -26.1810, 28.1430),
    ("Rosebank", -26.1448, 28.0436),
    ("Randburg", -26.0936, 28.0064),
    ("Midrand", -25.9992, 28.1263),
    ("Fourways", -26.0156, 28.0103),
    ("Roodepoort", -26.1632, 27.8728),
]

EVENT_TYPES = [
    ("harsh_brake", 2, "Harsh braking detected"),
    ("speeding", 3, "Speed limit exceeded"),
    ("fatigue", 4, "Fatigue signs detected by camera"),
    ("phone_use", 3, "Phone use while driving"),
    ("sharp_turn", 1, "Sharp turn detected"),
]

ALERT_TEMPLATES = [
    ("fatigue", "critical", "Fatigue Detected", "Driver shows signs of fatigue — recommend immediate break"),
    ("route_deviation", "warning", "Route Deviation", "Driver is 1.4 km off the planned route"),
    ("delay", "warning", "Delivery Delayed", "Stop is running 18 min behind schedule"),
    ("harsh_braking", "warning", "Harsh Braking", "Multiple harsh-braking events in last 10 min"),
    ("speeding", "warning", "Speeding Detected", "Vehicle exceeded 80 km/h in a 60 km/h zone"),
    ("device_offline", "info", "Device Offline", "Driver device has been offline for 5 min"),
    ("battery_low", "info", "Low Battery", "Device battery dropped below 15%"),
]


@auth_bp.route("/api/demo/seed", methods=["POST"])
@require_auth
@require_admin
def seed_demo_data():
    db = get_db_session()
    try:
        drivers = db.query(Driver).filter(Driver.company_id == g.company_id).all()
        existing_devices = db.query(Device).filter(Device.company_id == g.company_id).count()
        existing_alerts = db.query(Alert).filter(Alert.company_id == g.company_id).count()
        existing_events = db.query(SafetyEvent).filter(SafetyEvent.company_id == g.company_id).count()

        created = {"devices": 0, "alerts": 0, "safety_events": 0}
        now = datetime.now(timezone.utc)

        # --- Devices: one per driver (or 6 demo devices if no drivers) ---
        if existing_devices == 0:
            targets = drivers if drivers else [None] * 6
            for i, d in enumerate(targets):
                seed = random.Random(f"{g.company_id}-{i}")
                status = "online" if seed.random() > 0.15 else "offline"
                battery = seed.randint(8, 100) if status == "online" else seed.randint(0, 40)
                ota = seed.choice(["up_to_date", "up_to_date", "up_to_date", "update_available"])
                dev = Device(
                    id=f"DEV-{uuid.uuid4().hex[:6].upper()}",
                    name=(d.name + " device") if d else f"Spare device {i + 1}",
                    model=seed.choice(["Samsung A52", "Pixel 7", "Aiviate Edge X1", "iPhone 13"]),
                    status=status,
                    battery_pct=battery,
                    signal_strength=seed.randint(30, 100) if status == "online" else 0,
                    accel_status=seed.choice(["ok", "ok", "ok", "warning"]),
                    camera_status=seed.choice(["ok", "ok", "ok", "offline"]),
                    firmware_version=seed.choice(["1.0.0", "1.0.2", "1.1.0"]),
                    ota_status=ota,
                    last_seen=now - timedelta(minutes=seed.randint(0, 300)),
                    driver_id=d.id if d else None,
                    company_id=g.company_id,
                )
                db.add(dev)
                created["devices"] += 1

        # --- Safety events: 4-10 per driver ---
        if existing_events == 0 and drivers:
            for d in drivers:
                seed = random.Random(f"{g.company_id}-safety-{d.id}")
                count = seed.randint(2, 9)
                for _ in range(count):
                    et, sev, _ = seed.choice(EVENT_TYPES)
                    _, lat, lng = seed.choice(JHB_POINTS)
                    event = SafetyEvent(
                        id=f"EVT-{uuid.uuid4().hex[:8].upper()}",
                        driver_id=d.id,
                        event_type=et,
                        severity=sev,
                        lat=lat + seed.uniform(-0.02, 0.02),
                        lng=lng + seed.uniform(-0.02, 0.02),
                        company_id=g.company_id,
                        created_at=now - timedelta(minutes=seed.randint(5, 60 * 24 * 7)),
                    )
                    db.add(event)
                    created["safety_events"] += 1

        # --- Alerts: ~12 recent alerts ---
        if existing_alerts == 0:
            seed = random.Random(f"{g.company_id}-alerts")
            for i in range(12):
                t, sev, title, msg = seed.choice(ALERT_TEMPLATES)
                driver = seed.choice(drivers) if drivers else None
                alert = Alert(
                    id=f"ALT-{uuid.uuid4().hex[:8].upper()}",
                    type=t,
                    severity=sev,
                    title=title,
                    message=msg,
                    driver_id=driver.id if driver else None,
                    driver_name=driver.name if driver else None,
                    is_read=i > 4,
                    company_id=g.company_id,
                    created_at=now - timedelta(minutes=seed.randint(2, 60 * 24 * 3)),
                )
                db.add(alert)
                created["alerts"] += 1

        db.commit()
        return jsonify({"success": True, "created": created})
    except Exception as e:
        db.rollback()
        return jsonify({"error": f"Failed to seed: {e}"}), 500
    finally:
        db.close()

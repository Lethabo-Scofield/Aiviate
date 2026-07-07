"""Demo login endpoint — provisions a shared demo tenant with seeded data."""

import uuid
import random
import traceback
from datetime import datetime, timezone, timedelta

import bcrypt
from flask import jsonify

from routes import auth_bp
from models import (
    Company, User, Driver, Job, Stop, Device, Alert, SafetyEvent,
)
from utils import generate_token, get_db_session


DEMO_EMAIL = "demo@aiviate.io"
DEMO_PASSWORD = "demo"
DEMO_COMPANY_ID = "CMP-DEMO0001"
DEMO_USER_ID = "USR-DEMO0001"

DEMO_DRIVERS = [
    ("Thabo Mokoena", "van"),
    ("Lerato Dlamini", "bike"),
    ("Sipho Khumalo", "van"),
    ("Naledi Botha", "truck"),
    ("Johan van der Merwe", "van"),
]

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
    ("harsh_brake", 2), ("speeding", 3), ("fatigue", 4),
    ("phone_use", 3), ("sharp_turn", 1),
]

ALERT_TEMPLATES = [
    ("fatigue", "critical", "Fatigue Detected", "Driver shows signs of fatigue. Recommend an immediate break"),
    ("route_deviation", "warning", "Route Deviation", "Driver is 1.4 km off the planned route"),
    ("delay", "warning", "Delivery Delayed", "Stop is running 18 min behind schedule"),
    ("harsh_braking", "warning", "Harsh Braking", "Multiple harsh-braking events in last 10 min"),
    ("speeding", "warning", "Speeding Detected", "Vehicle exceeded 80 km/h in a 60 km/h zone"),
    ("device_offline", "info", "Device Offline", "Driver device has been offline for 5 min"),
    ("battery_low", "info", "Low Battery", "Device battery dropped below 15%"),
]


def _ensure_demo_tenant(db):
    """Idempotently create the demo company, admin user, drivers, jobs and telemetry."""
    now = datetime.now(timezone.utc)
    rnd = random.Random("aiviate-demo")

    company = db.query(Company).filter(Company.id == DEMO_COMPANY_ID).first()
    if not company:
        company = Company(id=DEMO_COMPANY_ID, name="Aiviate Demo Logistics", domain="aiviate.io")
        db.add(company)

    user = db.query(User).filter(User.email == DEMO_EMAIL).first()
    if not user:
        password_hash = bcrypt.hashpw(DEMO_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        user = User(
            id=DEMO_USER_ID,
            email=DEMO_EMAIL,
            password_hash=password_hash,
            name="Demo Dispatcher",
            role="admin",
            company_id=DEMO_COMPANY_ID,
        )
        db.add(user)
    db.flush()

    # Drivers
    drivers = db.query(Driver).filter(Driver.company_id == DEMO_COMPANY_ID).all()
    if not drivers:
        drivers = []
        for i, (name, veh) in enumerate(DEMO_DRIVERS):
            d = Driver(
                id=f"DRV-DEMO{i+1:03d}",
                name=name,
                email=f"{name.split()[0].lower()}@aiviate.io",
                vehicle_type=veh,
                status="available",
                company_id=DEMO_COMPANY_ID,
            )
            db.add(d)
            drivers.append(d)
        db.flush()

    # A couple of jobs with stops, one assigned and on-route
    existing_jobs = db.query(Job).filter(Job.company_id == DEMO_COMPANY_ID).count()
    if existing_jobs == 0:
        statuses = ["assigned", "assigned", "unassigned", "completed"]
        for i, status in enumerate(statuses):
            area_name, clat, clng = rnd.choice(JHB_POINTS)
            job_id = f"JOB-DEMO{i+1:03d}"
            stops_n = rnd.randint(5, 9)
            total_dist = round(rnd.uniform(20, 65), 1)
            est_time = int(total_dist / 35 * 60) + stops_n * 15
            driver = drivers[i % len(drivers)] if status != "unassigned" else None
            job = Job(
                id=job_id,
                area=area_name,
                total_stops=stops_n,
                total_distance_km=total_dist,
                estimated_time_min=est_time,
                estimated_cost=round(total_dist * 12 + est_time * 2.5, 2),
                center_lat=clat,
                center_lng=clng,
                status=status,
                driver_id=driver.id if driver else None,
                driver_name=driver.name if driver else None,
                assigned_at=now - timedelta(hours=rnd.randint(1, 6)) if driver else None,
                completed_at=now - timedelta(hours=1) if status == "completed" else None,
                company_id=DEMO_COMPANY_ID,
            )
            db.add(job)
            for s in range(stops_n):
                lat = clat + rnd.uniform(-0.04, 0.04)
                lng = clng + rnd.uniform(-0.04, 0.04)
                db.add(Stop(
                    id=f"STP-DEMO{i+1:02d}{s+1:02d}",
                    order_id=f"ORD-{1000+i*10+s}",
                    customer_name=rnd.choice([
                        "Mandela Foods", "Joburg Pharmacy", "Highveld Hardware",
                        "Township Spaza", "Gauteng Electrical", "Sasol Garage",
                        "Pick n Pay", "Checkers Local", "Builders Express",
                    ]),
                    address=f"{rnd.randint(1, 250)} {rnd.choice(['Main','Oak','Acacia','Jacaranda','Vilakazi'])} St, {area_name}",
                    lat=lat, lng=lng,
                    demand=rnd.randint(1, 4),
                    service_time=rnd.randint(10, 25),
                    phone=f"+27 {rnd.randint(60,84)} {rnd.randint(100,999)} {rnd.randint(1000,9999)}",
                    job_id=job_id,
                    stop_number=s + 1,
                    completed=status == "completed" or (status == "assigned" and s < 2),
                    completed_at=now - timedelta(minutes=rnd.randint(10, 240)) if (status == "completed" or (status == "assigned" and s < 2)) else None,
                    company_id=DEMO_COMPANY_ID,
                ))

    # Devices (one per driver)
    existing_devices = db.query(Device).filter(Device.company_id == DEMO_COMPANY_ID).count()
    if existing_devices == 0:
        for i, d in enumerate(drivers):
            seed = random.Random(f"demo-dev-{i}")
            status = "online" if seed.random() > 0.15 else "offline"
            battery = seed.randint(15, 100) if status == "online" else seed.randint(0, 35)
            ota = seed.choice(["up_to_date", "up_to_date", "up_to_date", "update_available"])
            db.add(Device(
                id=f"DEV-DEMO{i+1:03d}",
                name=f"{d.name.split()[0]}'s device",
                model=seed.choice(["Samsung A52", "Pixel 7", "Aiviate Edge X1", "iPhone 13"]),
                status=status,
                battery_pct=battery,
                signal_strength=seed.randint(40, 100) if status == "online" else 0,
                accel_status=seed.choice(["ok", "ok", "ok", "warning"]),
                camera_status=seed.choice(["ok", "ok", "ok", "offline"]),
                firmware_version=seed.choice(["1.0.0", "1.0.2", "1.1.0"]),
                ota_status=ota,
                last_seen=now - timedelta(minutes=seed.randint(0, 240)),
                driver_id=d.id,
                company_id=DEMO_COMPANY_ID,
            ))

    # Safety events
    existing_events = db.query(SafetyEvent).filter(SafetyEvent.company_id == DEMO_COMPANY_ID).count()
    if existing_events == 0:
        for d in drivers:
            seed = random.Random(f"demo-saf-{d.id}")
            for _ in range(seed.randint(3, 9)):
                et, sev = seed.choice(EVENT_TYPES)
                _, lat, lng = seed.choice(JHB_POINTS)
                db.add(SafetyEvent(
                    id=f"EVT-{uuid.uuid4().hex[:8].upper()}",
                    driver_id=d.id,
                    event_type=et,
                    severity=sev,
                    lat=lat + seed.uniform(-0.02, 0.02),
                    lng=lng + seed.uniform(-0.02, 0.02),
                    company_id=DEMO_COMPANY_ID,
                    created_at=now - timedelta(minutes=seed.randint(5, 60 * 24 * 7)),
                ))

    # Alerts
    existing_alerts = db.query(Alert).filter(Alert.company_id == DEMO_COMPANY_ID).count()
    if existing_alerts == 0:
        seed = random.Random("demo-alerts")
        for i in range(14):
            t, sev, title, msg = seed.choice(ALERT_TEMPLATES)
            driver = seed.choice(drivers)
            db.add(Alert(
                id=f"ALT-{uuid.uuid4().hex[:8].upper()}",
                type=t,
                severity=sev,
                title=title,
                message=msg,
                driver_id=driver.id,
                driver_name=driver.name,
                is_read=i > 5,
                company_id=DEMO_COMPANY_ID,
                created_at=now - timedelta(minutes=seed.randint(2, 60 * 24 * 3)),
            ))

    db.commit()
    return user


@auth_bp.route("/api/auth/demo-login", methods=["POST"])
def demo_login():
    db = get_db_session()
    try:
        user = _ensure_demo_tenant(db)
        token = generate_token(user)
        return jsonify({"success": True, "token": token, "user": user.to_dict()})
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": f"Demo login failed: {e}"}), 500
    finally:
        db.close()

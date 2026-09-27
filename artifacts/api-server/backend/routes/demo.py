"""Demo login endpoint — provisions the demo tenant (company + admin user only).

No demo drivers, jobs, stops, devices, or alerts are seeded: all operational
data comes from real store-order imports, spreadsheet uploads, and drivers
added through the Fleet page.
"""

import traceback
import os
import uuid

import bcrypt
from flask import abort, jsonify

from routes import auth_bp
from models import Company, Driver, User
from utils import generate_token, get_db_session


DEMO_EMAIL = "demo@aiviate.io"
DEMO_PASSWORD = "demo"
DEMO_COMPANY_ID = "CMP-DEMO0001"
DEMO_USER_ID = "USR-DEMO0001"
DEMO_DRIVER_ID = "DRV-DEMO0001"
DEMO_DRIVER_USER_ID = "USR-DEMODRIVER1"
DEMO_DRIVER_EMAIL = "driver-demo@aiviate.io"


def _ensure_demo_tenant(db):
    """Idempotently create the demo company and admin user."""
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


@auth_bp.route("/api/auth/preview-driver-login", methods=["POST"])
def preview_driver_login():
    # Only the local development workflow enables this passwordless preview.
    if os.environ.get("AIVIATE_PREVIEW_DRIVER") != "1":
        abort(404)

    db = get_db_session()
    try:
        _ensure_demo_tenant(db)
        driver = db.query(Driver).filter(Driver.id == DEMO_DRIVER_ID).first()
        if not driver:
            driver = Driver(
                id=DEMO_DRIVER_ID,
                name="Demo Driver",
                email=DEMO_DRIVER_EMAIL,
                company_id=DEMO_COMPANY_ID,
                user_id=DEMO_DRIVER_USER_ID,
            )
            db.add(driver)
            db.flush()

        user = db.query(User).filter(User.email == DEMO_DRIVER_EMAIL).first()
        if not user:
            password = uuid.uuid4().hex
            user = User(
                id=DEMO_DRIVER_USER_ID,
                email=DEMO_DRIVER_EMAIL,
                password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
                name="Demo Driver",
                role="driver",
                company_id=DEMO_COMPANY_ID,
                driver_id=DEMO_DRIVER_ID,
            )
            db.add(user)
        elif user.role != "driver" or user.driver_id != DEMO_DRIVER_ID or user.company_id != DEMO_COMPANY_ID:
            return jsonify({"error": "Preview driver account conflicts with an existing user"}), 409

        db.commit()
        return jsonify({"success": True, "token": generate_token(user), "user": user.to_dict()})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Driver preview login failed"}), 500
    finally:
        db.close()

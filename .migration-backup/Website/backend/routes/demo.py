"""Demo login endpoint — provisions the demo tenant (company + admin user only).

No demo drivers, jobs, stops, devices, or alerts are seeded: all operational
data comes from real store-order imports, spreadsheet uploads, and drivers
added through the Fleet page.
"""

import traceback

import bcrypt
from flask import jsonify

from routes import auth_bp
from models import Company, User
from utils import generate_token, get_db_session


DEMO_EMAIL = "demo@aiviate.io"
DEMO_PASSWORD = "demo"
DEMO_COMPANY_ID = "CMP-DEMO0001"
DEMO_USER_ID = "USR-DEMO0001"


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

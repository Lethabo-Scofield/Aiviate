import uuid
import traceback

import bcrypt
from flask import request, jsonify, g

from routes import auth_bp
from middleware import require_auth
from models import User, Company, Driver
from utils import generate_token, get_db_session


@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")
    name = (data.get("name") or "").strip()
    company_name = (data.get("company_name") or "").strip()

    if not email or not password or not name or not company_name:
        return jsonify({"error": "All fields are required: name, email, password, company_name"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    db = get_db_session()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            return jsonify({"error": "An account with this email already exists"}), 409

        domain = email.split("@")[1] if "@" in email else ""

        company_id = f"CMP-{uuid.uuid4().hex[:8].upper()}"
        company = Company(id=company_id, name=company_name, domain=domain)
        db.add(company)

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        user_id = f"USR-{uuid.uuid4().hex[:8].upper()}"
        user = User(
            id=user_id,
            email=email,
            password_hash=password_hash,
            name=name,
            role="admin",
            company_id=company_id,
        )
        db.add(user)
        db.commit()

        db.refresh(user)
        token = generate_token(user)
        return jsonify({"success": True, "token": token, "user": user.to_dict()}), 201

    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Registration failed"}), 500
    finally:
        db.close()


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    db = get_db_session()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            return jsonify({"error": "Invalid email or password"}), 401

        if not bcrypt.checkpw(password.encode("utf-8"), user.password_hash.encode("utf-8")):
            return jsonify({"error": "Invalid email or password"}), 401

        if user.role == "driver" and user.driver_id:
            driver = db.query(Driver).filter(Driver.id == user.driver_id).first()
            if driver and driver.blocked:
                return jsonify({"error": "Your account has been blocked. Contact your dispatcher."}), 403

        token = generate_token(user)
        return jsonify({"success": True, "token": token, "user": user.to_dict()})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Login failed", "detail": f"{type(e).__name__}: {e}"}), 500
    finally:
        db.close()


@auth_bp.route("/api/auth/me", methods=["GET"])
@require_auth
def get_me():
    db = get_db_session()
    try:
        user = db.query(User).filter(User.id == g.user_id).first()
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify({"user": user.to_dict()})
    finally:
        db.close()

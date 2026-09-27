from functools import wraps
from flask import request, jsonify, g
import jwt
from config import JWT_SECRET


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]

        if not token:
            return jsonify({"error": "Authentication required"}), 401

        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            g.user_id = payload["user_id"]
            g.company_id = payload["company_id"]
            g.user_email = payload.get("email", "")
            g.user_role = payload.get("role", "admin")
            g.driver_id = payload.get("driver_id")
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

        if g.user_role == "driver" and g.driver_id:
            from models import Driver
            from utils import get_db_session
            db = get_db_session()
            try:
                driver = db.query(Driver).filter(Driver.id == g.driver_id).first()
                if driver and driver.blocked:
                    return jsonify({"error": "Your account has been blocked. Contact your dispatcher."}), 403
            finally:
                db.close()

        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if g.user_role != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated

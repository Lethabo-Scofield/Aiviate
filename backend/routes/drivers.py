import uuid
import traceback

import bcrypt
from flask import request, jsonify, g

from routes import drivers_bp
from middleware import require_auth, require_admin
from models import Driver, User, Job, Stop
from utils import get_db_session


@drivers_bp.route("/api/drivers", methods=["GET"])
@require_auth
@require_admin
def get_drivers():
    db = get_db_session()
    try:
        drivers = db.query(Driver).filter(Driver.company_id == g.company_id).all()
        return jsonify({"drivers": [d.to_dict() for d in drivers]})
    finally:
        db.close()


@drivers_bp.route("/api/drivers", methods=["POST"])
@require_auth
@require_admin
def add_driver():
    data = request.get_json() or {}
    name = data.get("name")
    email = (data.get("email") or "").strip().lower()
    vehicle_type = data.get("vehicle_type", "van")
    password = data.get("password", "")

    if not name:
        return jsonify({"error": "Driver name is required"}), 400

    if not email:
        return jsonify({"error": "Driver email is required for app login"}), 400

    db = get_db_session()
    try:
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            return jsonify({"error": f"A user with email {email} already exists"}), 409

        driver_id = f"DRV-{uuid.uuid4().hex[:6].upper()}"

        if not password:
            password = uuid.uuid4().hex[:8]

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        user_id = f"USR-{uuid.uuid4().hex[:8].upper()}"

        driver = Driver(
            id=driver_id,
            name=name,
            email=email,
            vehicle_type=vehicle_type,
            company_id=g.company_id,
            user_id=user_id,
            last_generated_password=password,
        )
        db.add(driver)
        db.flush()

        user = User(
            id=user_id,
            email=email,
            password_hash=password_hash,
            name=name,
            role="driver",
            company_id=g.company_id,
            driver_id=driver_id,
        )
        db.add(user)
        db.commit()

        result = driver.to_dict()
        result["generated_password"] = password

        return jsonify({"success": True, "driver": result}), 201
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to add driver"}), 500
    finally:
        db.close()


@drivers_bp.route("/api/drivers/<driver_id>", methods=["GET"])
@require_auth
@require_admin
def get_driver_detail(driver_id):
    db = get_db_session()
    try:
        driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == g.company_id).first()
        if not driver:
            return jsonify({"error": "Driver not found"}), 404

        driver_jobs = db.query(Job).filter(Job.driver_id == driver_id, Job.company_id == g.company_id).all()

        completed_jobs = [j for j in driver_jobs if j.status == "completed"]
        active_jobs = [j for j in driver_jobs if j.status in ("assigned",)]

        total_stops_completed = 0
        total_stops_assigned = 0
        for job in driver_jobs:
            stops = db.query(Stop).filter(Stop.job_id == job.id).all()
            total_stops_completed += sum(1 for s in stops if s.completed)
            total_stops_assigned += len(stops)

        result = driver.to_dict()
        result["last_generated_password"] = driver.last_generated_password
        result["total_jobs"] = len(driver_jobs)
        result["completed_jobs"] = len(completed_jobs)
        result["active_jobs"] = len(active_jobs)
        result["total_stops_completed"] = total_stops_completed
        result["total_stops_assigned"] = total_stops_assigned
        result["jobs"] = [j.to_dict() for j in driver_jobs]

        return jsonify({"driver": result})
    finally:
        db.close()


@drivers_bp.route("/api/drivers/<driver_id>/location", methods=["POST"])
@require_auth
def update_driver_location(driver_id):
    """Streams a driver's current location. Called by the mobile app.

    Accepts: {"lat": float, "lng": float}. Idempotent — overwrites the last
    known location and updates the timestamp. Authz: only an admin in the
    tenant, or the driver themselves, may post.
    """
    from datetime import datetime, timezone
    role = getattr(g, "user_role", None)
    self_driver_id = getattr(g, "driver_id", None)
    if role != "admin" and self_driver_id != driver_id:
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json(silent=True) or {}
    try:
        lat = float(data.get("lat"))
        lng = float(data.get("lng"))
    except (TypeError, ValueError):
        return jsonify({"error": "lat and lng are required floats"}), 400
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return jsonify({"error": "lat/lng out of range"}), 400

    db = get_db_session()
    try:
        driver = db.query(Driver).filter(
            Driver.id == driver_id, Driver.company_id == g.company_id
        ).first()
        if not driver:
            return jsonify({"error": "Driver not found"}), 404
        driver.current_lat = lat
        driver.current_lng = lng
        driver.location_updated_at = datetime.now(timezone.utc)
        db.commit()
        return jsonify({"ok": True, "lat": lat, "lng": lng})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to update location"}), 500
    finally:
        db.close()


@drivers_bp.route("/api/drivers/<driver_id>/block", methods=["POST"])
@require_auth
@require_admin
def toggle_block_driver(driver_id):
    db = get_db_session()
    try:
        driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == g.company_id).first()
        if not driver:
            return jsonify({"error": "Driver not found"}), 404

        driver.blocked = not (driver.blocked or False)
        db.commit()

        return jsonify({"success": True, "blocked": driver.blocked, "driver": driver.to_dict()})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to update driver"}), 500
    finally:
        db.close()


@drivers_bp.route("/api/drivers/<driver_id>/reset-password", methods=["POST"])
@require_auth
@require_admin
def reset_driver_password(driver_id):
    db = get_db_session()
    try:
        driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == g.company_id).first()
        if not driver:
            return jsonify({"error": "Driver not found"}), 404

        if not driver.user_id:
            return jsonify({"error": "Driver has no login account"}), 400

        user = db.query(User).filter(User.id == driver.user_id, User.company_id == g.company_id).first()
        if not user:
            return jsonify({"error": "Driver account not found"}), 404

        new_password = uuid.uuid4().hex[:8]
        password_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        user.password_hash = password_hash
        driver.last_generated_password = new_password
        db.commit()

        return jsonify({"success": True, "new_password": new_password})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to reset password"}), 500
    finally:
        db.close()


@drivers_bp.route("/api/drivers/<driver_id>/deliveries", methods=["GET"])
@require_auth
@require_admin
def get_driver_deliveries(driver_id):
    db = get_db_session()
    try:
        driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == g.company_id).first()
        if not driver:
            return jsonify({"error": "Driver not found"}), 404

        driver_jobs = db.query(Job).filter(Job.driver_id == driver_id, Job.company_id == g.company_id).all()

        deliveries = []
        for job in driver_jobs:
            stops = db.query(Stop).filter(Stop.job_id == job.id).all()
            completed_stops = [s for s in stops if s.completed]
            deliveries.append({
                "job": job.to_dict(),
                "total_stops": len(stops),
                "completed_stops": len(completed_stops),
                "completion_pct": round(len(completed_stops) / len(stops) * 100) if stops else 0,
            })

        return jsonify({"driver_id": driver_id, "deliveries": deliveries})
    finally:
        db.close()


@drivers_bp.route("/api/drivers/<driver_id>", methods=["DELETE"])
@require_auth
@require_admin
def remove_driver(driver_id):
    db = get_db_session()
    try:
        driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == g.company_id).first()
        if not driver:
            return jsonify({"error": "Driver not found"}), 404

        jobs = db.query(Job).filter(Job.driver_id == driver_id, Job.company_id == g.company_id).all()
        for job in jobs:
            job.status = "unassigned"
            job.driver_id = None
            job.driver_name = None

        if driver.user_id:
            user = db.query(User).filter(User.id == driver.user_id).first()
            if user:
                db.delete(user)

        db.delete(driver)
        db.commit()
        return jsonify({"success": True})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to remove driver"}), 500
    finally:
        db.close()


@drivers_bp.route("/api/my-jobs", methods=["GET"])
@require_auth
def get_my_jobs():
    db = get_db_session()
    try:
        driver = db.query(Driver).filter(
            Driver.user_id == g.user_id,
            Driver.company_id == g.company_id,
        ).first()

        if not driver:
            driver = db.query(Driver).filter(
                Driver.email == g.user_email,
                Driver.company_id == g.company_id,
            ).first()

        if not driver:
            return jsonify({"jobs": [], "driver": None})

        my_jobs = db.query(Job).filter(
            Job.driver_id == driver.id,
            Job.company_id == g.company_id,
        ).all()

        return jsonify({
            "driver": driver.to_dict(),
            "jobs": [j.to_dict() for j in my_jobs],
        })
    finally:
        db.close()


@drivers_bp.route("/api/my-jobs/<job_id>/complete/<stop_id>", methods=["POST"])
@require_auth
def complete_my_stop(job_id, stop_id):
    from models import Stop
    from datetime import datetime, timezone

    db = get_db_session()
    try:
        driver = db.query(Driver).filter(
            Driver.user_id == g.user_id,
            Driver.company_id == g.company_id,
        ).first()

        if not driver:
            driver = db.query(Driver).filter(
                Driver.email == g.user_email,
                Driver.company_id == g.company_id,
            ).first()

        if not driver:
            return jsonify({"error": "No driver profile linked to your account"}), 403

        job = db.query(Job).filter(
            Job.id == job_id,
            Job.driver_id == driver.id,
            Job.company_id == g.company_id,
        ).first()
        if not job:
            return jsonify({"error": "Job not found or not assigned to you"}), 404

        stop = db.query(Stop).filter(Stop.id == stop_id, Stop.job_id == job_id).first()
        if not stop:
            return jsonify({"error": "Stop not found"}), 404

        stop.completed = True
        stop.completed_at = datetime.now(timezone.utc)

        all_stops = db.query(Stop).filter(Stop.job_id == job_id).all()
        if all(s.completed for s in all_stops):
            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)

        db.commit()
        return jsonify({"success": True, "stop": stop.to_dict(), "job_status": job.status})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to complete stop"}), 500
    finally:
        db.close()


@drivers_bp.route("/api/driver/<driver_id>/jobs", methods=["GET"])
@require_auth
def get_driver_jobs(driver_id):
    db = get_db_session()
    try:
        driver = db.query(Driver).filter(
            Driver.id == driver_id,
            Driver.company_id == g.company_id,
        ).first()
        if not driver:
            return jsonify({"error": "Driver not found"}), 404
        driver_jobs = db.query(Job).filter(Job.driver_id == driver_id, Job.company_id == g.company_id).all()
        return jsonify({"driver_id": driver_id, "jobs": [j.to_dict() for j in driver_jobs]})
    finally:
        db.close()


@drivers_bp.route("/api/driver/<driver_id>/complete/<job_id>/<stop_id>", methods=["POST"])
@require_auth
def complete_stop(driver_id, job_id, stop_id):
    from models import Stop
    from datetime import datetime, timezone

    db = get_db_session()
    try:
        job = db.query(Job).filter(
            Job.id == job_id,
            Job.driver_id == driver_id,
            Job.company_id == g.company_id,
        ).first()
        if not job:
            return jsonify({"error": "Job not found"}), 404

        stop = db.query(Stop).filter(Stop.id == stop_id, Stop.job_id == job_id).first()
        if not stop:
            return jsonify({"error": "Stop not found"}), 404

        stop.completed = True
        stop.completed_at = datetime.now(timezone.utc)

        all_stops = db.query(Stop).filter(Stop.job_id == job_id).all()
        if all(s.completed for s in all_stops):
            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)

        db.commit()
        return jsonify({"success": True, "stop": stop.to_dict(), "job_status": job.status})
    except Exception:
        db.rollback()
        return jsonify({"error": "Failed to complete stop"}), 500
    finally:
        db.close()

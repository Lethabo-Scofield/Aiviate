# filepath: c:\Users\ADMIN\Documents\PROJECT\Aviate_Admin\backend\routes\drivers.py
import uuid
import traceback
import os

import bcrypt
from services.email_service import send_email
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

        # Send welcome email with app download link and PDF manual
        try:
            _project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            _manual_path = os.path.join(_project_root, "docs", "Aviate_User_Manual.pdf")
            _app_link = "https://expo.dev/artifacts/eas/4uEQdzphj6Xfc4eqpKmFxK.apk"

            subject = "🎉 Welcome to Aviate! Your Driver Account 🚚"
            html = f"""
                <div style='font-family: Arial, sans-serif; max-width: 520px; margin: auto; border: 1px solid #eee; border-radius: 8px; padding: 24px; background: #f9f9f9;'>
                    <h2 style='color: #2b7cff;'>Welcome, {name}! 👋</h2>
                    <p style='font-size: 1.1em;'>
                        Your driver account has been <b>successfully created</b>.<br>
                        You can now log in to the <b>Aviate</b> app and start your journey with us!
                    </p>
                    <div style='background: #fff; border-radius: 6px; padding: 16px; margin: 18px 0; border: 1px solid #e0e0e0;'>
                        <b>🚀 Login Details:</b><br><br>
                        <b>Email:</b> {email}<br>
                        <b>Password:</b> {password}
                    </div>
                    <p style='margin: 18px 0 8px; color: #333;'><b>📱 Download the Aviate App:</b></p>
                    <a href='{_app_link}' style='display:inline-block;background:#2b7cff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;'>
                        Download Aviate App ⬇️
                    </a>
                    <p style='margin: 10px 0 18px; word-break: break-all;'>
                        <a href='{_app_link}' style='color:#2b7cff;'>{_app_link}</a>
                    </p>
                    <p style='color: #555;'>
                        📄 The <b>Aviate User Manual</b> is attached as a PDF.<br>
                        Please <b>change your password</b> after logging in for the first time.<br>
                        If you have any questions, contact your dispatcher.
                    </p>
                    <p style='margin-top: 24px; color: #2b7cff;'>
                        Welcome aboard!<br>
                        <b>The Aviate Team ✈️</b>
                    </p>
                </div>
            """
            _attachments = [_manual_path] if os.path.exists(_manual_path) else None
            send_email(email, subject, html, attachments=_attachments)
            result["welcome_email_sent"] = True
            print(f"[INFO] Welcome email sent to {email}")
        except Exception as e:
            traceback.print_exc()
            result["welcome_email_sent"] = False
            print(f"[ERROR] Failed to send welcome email: {e}")

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

        try:
            if driver.blocked:
                subject = "🚫 Aviate Account Blocked"
                html = f"""
                    <div style='font-family: Arial, sans-serif; max-width: 480px; margin: auto; border: 1px solid #eee; border-radius: 8px; padding: 24px; background: #fff8f8;'>
                        <h2 style='color: #d32f2f;'>Account Blocked 🚫</h2>
                        <p>Dear {driver.name},</p>
                        <p>Your driver account has been <b>blocked</b> and you no longer have access to the Aviate platform.<br>
                        Please contact your administrator for more information.</p>
                        <p style='color: #d32f2f; margin-top: 24px;'>Aviate Security Team 🔒</p>
                    </div>
                """
            else:
                subject = "✅ Aviate Account Unblocked"
                html = f"""
                    <div style='font-family: Arial, sans-serif; max-width: 480px; margin: auto; border: 1px solid #eee; border-radius: 8px; padding: 24px; background: #f6fff6;'>
                        <h2 style='color: #388e3c;'>Account Unblocked ✅</h2>
                        <p>Dear {driver.name},</p>
                        <p>Your driver account has been <b>unblocked</b> and your access has been restored.<br>
                        You may now log in again and continue your work.</p>
                        <p style='color: #388e3c; margin-top: 24px;'>Aviate Support Team 🛫</p>
                    </div>
                """
            send_email(driver.email, subject, html)
        except Exception as e:
            print(f"Failed to send block/unblock email: {e}")

        return jsonify({"success": True, "blocked": driver.blocked, "driver": driver.to_dict()})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to update driver"}), 500
    finally:
        db.close()


@drivers_bp.route("/api/drivers/<driver_id>", methods=["DELETE"])
@require_auth
@require_admin
def delete_driver(driver_id):
    db = get_db_session()
    try:
        driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == g.company_id).first()
        if not driver:
            return jsonify({"error": "Driver not found"}), 404

        email = driver.email
        name = driver.name

        # unassign jobs
        jobs = db.query(Job).filter(Job.driver_id == driver_id, Job.company_id == g.company_id).all()
        for job in jobs:
            job.status = "unassigned"
            job.driver_id = None
            job.driver_name = None

        # delete linked user
        if driver.user_id:
            user = db.query(User).filter(User.id == driver.user_id).first()
            if user:
                db.delete(user)

        db.delete(driver)
        db.commit()

        # Send deletion email
        try:
            subject = "Account Deleted from Aviate"
            html = f"""
                <div style='font-family: Arial, sans-serif; max-width: 480px; margin: auto; border: 1px solid #eee; border-radius: 8px; padding: 24px; background: #fff8f8;'>
                    <h2 style='color: #d32f2f;'>Account Deleted</h2>
                    <p>Dear {name},</p>
                    <p>Your driver account has been <b>deleted</b> from the Aviate platform.<br>
                    If you believe this was a mistake, please contact your administrator.</p>
                    <p style='color: #d32f2f; margin-top: 24px;'>Aviate Team</p>
                </div>
            """
            send_email(email, subject, html)
        except Exception as e:
            print(f"Failed to send deletion email: {e}")

        return jsonify({"success": True, "message": "Driver deleted"})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to delete driver"}), 500
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

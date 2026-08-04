import traceback
from datetime import datetime, timezone

from flask import request, jsonify, g

from routes import jobs_bp
from middleware import require_auth, require_admin
from models import Job, Driver
from utils import get_db_session


@jobs_bp.route("/api/jobs", methods=["GET"])
@require_auth
@require_admin
def get_jobs():
    db = get_db_session()
    try:
        jobs = db.query(Job).filter(Job.company_id == g.company_id).all()
        return jsonify({"jobs": [j.to_dict() for j in jobs]})
    finally:
        db.close()


@jobs_bp.route("/api/jobs/<job_id>/assign", methods=["POST"])
@require_auth
@require_admin
def assign_driver(job_id):
    data = request.get_json() or {}
    driver_id = data.get("driver_id")

    if not driver_id:
        return jsonify({"error": "driver_id is required"}), 400

    db = get_db_session()
    try:
        driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == g.company_id).first()
        if not driver:
            return jsonify({"error": "Driver not found"}), 404

        job = db.query(Job).filter(Job.id == job_id, Job.company_id == g.company_id).first()
        if not job:
            return jsonify({"error": "Job not found"}), 404

        job.status = "assigned"
        job.driver_id = driver_id
        job.driver_name = driver.name
        job.assigned_at = datetime.now(timezone.utc)
        db.commit()

        # Auto-optimize the route on assignment. Best-effort: never block the
        # assignment response if the optimizer hiccups.
        opt_summary = None
        try:
            from intelligence.auto_optimizer import optimize_job_stops
            from intelligence.audit_logger import log_action

            start_lat = getattr(driver, "current_lat", None)
            start_lng = getattr(driver, "current_lng", None)
            opt_summary = optimize_job_stops(
                db, job, start_lat=start_lat, start_lng=start_lng
            )
            if opt_summary.get("status") == "ok":
                saved = opt_summary.get("distance_saved_km", 0)
                anchor = "driver location" if opt_summary.get("used_driver_location") else "depot"
                log_action(
                    db, company_id=g.company_id, action_type="route_auto_optimized",
                    summary=(
                        f"Auto-optimized route on assignment to {driver.name}: "
                        f"{opt_summary.get('stops_reordered')} stops reordered, "
                        f"{saved} km saved (anchored to {anchor})"
                    ),
                    actor="workflow_engine", confidence=0.95,
                    requires_approval=False, related_id=job.id,
                    details=opt_summary,
                )
        except Exception:
            traceback.print_exc()
            opt_summary = {"status": "error", "reason": "optimizer raised — see backend logs"}

        return jsonify({
            "success": True,
            "job": job.to_dict(),
            "auto_optimization": opt_summary,
        })
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to assign driver"}), 500
    finally:
        db.close()


@jobs_bp.route("/api/jobs/<job_id>/unassign", methods=["POST"])
@require_auth
@require_admin
def unassign_driver(job_id):
    db = get_db_session()
    try:
        job = db.query(Job).filter(Job.id == job_id, Job.company_id == g.company_id).first()
        if not job:
            return jsonify({"error": "Job not found"}), 404

        job.status = "unassigned"
        job.driver_id = None
        job.driver_name = None
        job.assigned_at = None
        db.commit()

        return jsonify({"success": True, "job": job.to_dict()})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to unassign driver"}), 500
    finally:
        db.close()

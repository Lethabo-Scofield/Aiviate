import traceback
from datetime import datetime, timezone

from flask import request, jsonify, g

from routes import stops_bp
from middleware import require_auth, require_admin
from models import Stop, Job
from utils import get_db_session

VALID_STATUSES = ("pending", "arrived", "completed", "failed")


@stops_bp.route("/api/stops", methods=["GET"])
@require_auth
@require_admin
def get_stops():
    db = get_db_session()
    try:
        stops = db.query(Stop).filter(Stop.company_id == g.company_id).all()
        return jsonify({"stops": [s.to_dict() for s in stops]})
    finally:
        db.close()


@stops_bp.route("/api/stops/<stop_id>/status", methods=["PATCH"])
@require_auth
def update_stop_status(stop_id):
    """Update a stop's status. Accessible by drivers (own company) and admins."""
    data = request.get_json() or {}
    new_status = data.get("status")
    reason = data.get("reason", "")

    if new_status not in VALID_STATUSES:
        return jsonify({"error": f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}"}), 400

    db = get_db_session()
    try:
        stop = db.query(Stop).filter(
            Stop.id == stop_id,
            Stop.company_id == g.company_id,
        ).first()
        if not stop:
            return jsonify({"error": "Stop not found"}), 404

        # Drivers can only update stops belonging to their assigned job
        if g.user_role == "driver":
            if not g.driver_id:
                return jsonify({"error": "Driver identity not found"}), 403
            job = db.query(Job).filter(
                Job.id == stop.job_id,
                Job.driver_id == g.driver_id,
            ).first()
            if not job:
                return jsonify({"error": "Not authorized to update this stop"}), 403

        now = datetime.now(timezone.utc)
        stop.status = new_status

        if new_status == "arrived":
            stop.arrived_at = now
        elif new_status == "completed":
            stop.completed = True
            stop.completed_at = now
            stop.arrived_at = stop.arrived_at or now
            # Mark the job as started on first completed stop
            job = db.query(Job).filter(Job.id == stop.job_id).first()
            if job and not job.started_at:
                job.started_at = now
                job.status = "in_progress"
            # Auto-complete job if all stops done
            if job:
                remaining = db.query(Stop).filter(
                    Stop.job_id == job.id,
                    Stop.completed == False,
                ).count()
                if remaining == 0:
                    job.status = "completed"
                    job.completed_at = now
        elif new_status == "failed":
            stop.failed_reason = reason
        elif new_status == "pending":
            stop.completed = False
            stop.completed_at = None
            stop.arrived_at = None
            stop.failed_reason = None

        db.commit()
        return jsonify({"success": True, "stop": stop.to_dict()})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to update stop status"}), 500
    finally:
        db.close()


@stops_bp.route("/api/jobs/<job_id>/progress", methods=["GET"])
@require_auth
def get_job_progress(job_id):
    """Retrieve live route progress for a job."""
    db = get_db_session()
    try:
        job = db.query(Job).filter(
            Job.id == job_id,
            Job.company_id == g.company_id,
        ).first()
        if not job:
            return jsonify({"error": "Job not found"}), 404

        stops = db.query(Stop).filter(Stop.job_id == job_id).order_by(Stop.stop_number).all()
        total = len(stops)
        completed = sum(1 for s in stops if s.completed)
        failed = sum(1 for s in stops if s.status == "failed")
        arrived = sum(1 for s in stops if s.status == "arrived")
        pending = total - completed - failed - arrived
        progress_pct = round((completed / total * 100) if total > 0 else 0, 1)

        # Determine timing status: delayed if assigned >120% of estimated time without completion
        timing_status = "on_time"
        if job.assigned_at and job.status not in ("completed", "unassigned"):
            # Ensure assigned_at is timezone-aware before comparing
            assigned_at_utc = job.assigned_at if job.assigned_at.tzinfo else job.assigned_at.replace(tzinfo=timezone.utc)
            elapsed_min = (datetime.now(timezone.utc) - assigned_at_utc).total_seconds() / 60
            est_min = job.estimated_time_min or 0
            if est_min > 0 and elapsed_min > est_min * 1.2 and progress_pct < 80:
                timing_status = "delayed"

        return jsonify({
            "job_id": job_id,
            "status": job.status,
            "driver_id": job.driver_id,
            "driver_name": job.driver_name,
            "total_stops": total,
            "completed_stops": completed,
            "failed_stops": failed,
            "arrived_stops": arrived,
            "pending_stops": pending,
            "progress_pct": progress_pct,
            "timing_status": timing_status,
            "assigned_at": job.assigned_at.isoformat() if job.assigned_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "estimated_time_min": job.estimated_time_min,
            "stops": [s.to_dict() for s in stops],
        })
    finally:
        db.close()

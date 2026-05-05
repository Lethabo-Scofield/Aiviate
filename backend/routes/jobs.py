import traceback
from datetime import datetime, timezone

from flask import request, jsonify, g

from routes import jobs_bp
from middleware import require_auth, require_admin
from models import Job, Driver, Stop
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

        return jsonify({"success": True, "job": job.to_dict()})
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


@jobs_bp.route("/api/jobs/<job_id>/reassign", methods=["POST"])
@require_auth
@require_admin
def reassign_driver(job_id):
    """Reassign a job to a different driver with basic re-optimisation of remaining stops."""
    data = request.get_json() or {}
    driver_id = data.get("driver_id")

    if not driver_id:
        return jsonify({"error": "driver_id is required"}), 400

    db = get_db_session()
    try:
        driver = db.query(Driver).filter(
            Driver.id == driver_id,
            Driver.company_id == g.company_id,
        ).first()
        if not driver:
            return jsonify({"error": "Driver not found"}), 404

        job = db.query(Job).filter(
            Job.id == job_id,
            Job.company_id == g.company_id,
        ).first()
        if not job:
            return jsonify({"error": "Job not found"}), 404

        # Collect remaining (not completed/failed) stops and re-sequence them
        all_stops = db.query(Stop).filter(Stop.job_id == job_id).order_by(Stop.stop_number).all()
        remaining = [s for s in all_stops if not s.completed and s.status != "failed"]

        if remaining and len(remaining) > 1:
            # Use current driver GPS as starting point if available, otherwise first stop
            start_lat = driver.current_lat or remaining[0].lat
            start_lng = driver.current_lng or remaining[0].lng

            from optimize_route import build_distance_matrix, solve_tsp
            from utils import haversine

            # Build distance matrix including a virtual "current location" depot at index 0
            locations = [(start_lat, start_lng)] + [(s.lat, s.lng) for s in remaining]
            dist_matrix = build_distance_matrix(locations)
            route_indices, _ = solve_tsp(dist_matrix, start=0)

            # route_indices[0] is the depot (index 0), rest are 1-based into remaining
            seq = 1
            for idx in route_indices:
                if idx == 0:
                    continue  # skip depot
                stop = remaining[idx - 1]
                stop.stop_number = seq
                seq += 1

        # Update assignment
        job.driver_id = driver_id
        job.driver_name = driver.name
        job.assigned_at = datetime.now(timezone.utc)
        if job.status in ("unassigned",):
            job.status = "assigned"
        # Reset to assigned if previously completed (edge case)
        if job.status == "completed":
            job.status = "in_progress"

        db.commit()
        return jsonify({"success": True, "job": job.to_dict()})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to reassign driver"}), 500
    finally:
        db.close()

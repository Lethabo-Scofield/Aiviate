import traceback
import uuid
from datetime import datetime, timezone

from flask import jsonify, g

from routes import engine_bp
from middleware import require_auth, require_admin
from models import Stop, Driver, Job
from utils import get_db_session
import engine_client


@engine_bp.route("/api/engine/status", methods=["GET"])
@require_auth
def engine_status():
    return jsonify({"available": engine_client.health()})


@engine_bp.route("/api/engine/optimize", methods=["POST"])
@require_auth
@require_admin
def engine_optimize():
    company_id = g.company_id

    db = get_db_session()
    try:
        stops = db.query(Stop).filter(Stop.company_id == company_id).all()
        stops_data = [s.to_dict() for s in stops]
    finally:
        db.close()

    try:
        result = engine_client.optimize_stops(stops_data)
        return jsonify(result)
    except engine_client.EngineError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "The AI Planner failed to produce a plan."}), 502


@engine_bp.route("/api/engine/dispatch", methods=["POST"])
@require_auth
@require_admin
def engine_dispatch():
    """Run the optimizer and persist the result: one Job per route, each
    assigned to an available driver, with stops linked in visiting order."""
    company_id = g.company_id

    db = get_db_session()
    try:
        stops = db.query(Stop).filter(Stop.company_id == company_id).all()
        stops_data = [s.to_dict() for s in stops]

        if len(stops_data) < 2:
            return jsonify({"error": "Need at least 2 stops to build a plan."}), 400

        try:
            result = engine_client.optimize_stops(stops_data)
        except engine_client.EngineError as exc:
            return jsonify({"error": str(exc)}), 400

        routes = result.get("routes") or []
        if not routes:
            return jsonify({"error": "The planner did not return any routes."}), 400

        drivers = (
            db.query(Driver)
            .filter(Driver.company_id == company_id, Driver.blocked.isnot(True))
            .order_by(Driver.name)
            .all()
        )
        if not drivers:
            return jsonify({"error": "No drivers available. Add a driver first, then run the planner."}), 400

        stop_by_id = {s.id: s for s in stops}
        now = datetime.now(timezone.utc)
        ts = int(now.timestamp())
        created_jobs = []

        for idx, route in enumerate(routes):
            driver = drivers[idx % len(drivers)]
            route_stops = route.get("stops") or []

            lats = [rs.get("lat") for rs in route_stops if rs.get("lat") is not None]
            lngs = [rs.get("lng") for rs in route_stops if rs.get("lng") is not None]
            center_lat = sum(lats) / len(lats) if lats else None
            center_lng = sum(lngs) / len(lngs) if lngs else None

            dist = route.get("distance_km") or 0
            dur = route.get("duration_min") or 0
            job_id = f"JOB-AI-{ts}-{uuid.uuid4().hex[:12]}"
            job = Job(
                id=job_id,
                area=f"AI Route {idx + 1}",
                total_stops=len(route_stops),
                total_distance_km=round(dist, 1),
                estimated_time_min=int(dur),
                estimated_cost=round(dist * 12 + dur * 2.5, 2),
                center_lat=center_lat,
                center_lng=center_lng,
                status="assigned",
                driver_id=driver.id,
                driver_name=driver.name,
                assigned_at=now,
                company_id=company_id,
            )
            db.add(job)

            for seq, rs in enumerate(route_stops, start=1):
                stop = stop_by_id.get(rs.get("stop_id"))
                if stop is not None:
                    stop.job_id = job_id
                    stop.stop_number = seq

            created_jobs.append((job, driver))

        db.flush()

        # Remove any prior jobs for this company that are now empty because
        # all their stops were re-planned into the new AI jobs.
        new_ids = {job.id for job, _ in created_jobs}
        for old_job in db.query(Job).filter(Job.company_id == company_id).all():
            if old_job.id in new_ids:
                continue
            remaining = db.query(Stop).filter(Stop.job_id == old_job.id).count()
            if remaining == 0:
                db.delete(old_job)

        db.commit()

        assignments = [
            {"job_id": job.id, "area": job.area, "driver_name": driver.name,
             "stops": job.total_stops}
            for job, driver in created_jobs
        ]

        return jsonify({
            "success": True,
            "jobs_created": len(created_jobs),
            "drivers_assigned": len({j.driver_id for j, _ in created_jobs}),
            "assignments": assignments,
            "plan": result,
        })
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to save and assign the plan."}), 500
    finally:
        db.close()

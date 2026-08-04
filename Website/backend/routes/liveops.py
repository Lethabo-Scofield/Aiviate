import math
import hashlib
import time
from datetime import datetime, timezone

from flask import jsonify, g

from routes import liveops_bp
from middleware import require_auth, require_admin
from models import Driver, Job, Stop, Alert
from utils import get_db_session


def _seed_offset(driver_id, span):
    h = int(hashlib.md5(driver_id.encode()).hexdigest()[:8], 16)
    return (h % 1000) / 1000.0 * span


@liveops_bp.route("/api/live-ops", methods=["GET"])
@require_auth
@require_admin
def live_ops():
    db = get_db_session()
    try:
        drivers = db.query(Driver).filter(Driver.company_id == g.company_id).all()
        jobs = db.query(Job).filter(Job.company_id == g.company_id).all()
        jobs_by_driver = {}
        for j in jobs:
            if j.driver_id:
                jobs_by_driver.setdefault(j.driver_id, []).append(j)

        now = time.time()
        result = []
        for d in drivers:
            d_jobs = jobs_by_driver.get(d.id, [])
            active_job = next((j for j in d_jobs if j.status == "assigned"), None)
            stops = []
            if active_job:
                stops = sorted(
                    db.query(Stop).filter(Stop.job_id == active_job.id).all(),
                    key=lambda s: s.stop_number or 0,
                )

            completed_stops = [s for s in stops if s.completed]
            remaining = [s for s in stops if not s.completed]
            progress_pct = int(len(completed_stops) / len(stops) * 100) if stops else 0

            # Simulated live position — gentle wobble around current target stop or job center
            target_stop = remaining[0] if remaining else (stops[-1] if stops else None)
            if target_stop and target_stop.lat:
                base_lat, base_lng = target_stop.lat, target_stop.lng
            elif active_job and active_job.center_lat:
                base_lat, base_lng = active_job.center_lat, active_job.center_lng
            else:
                # Default Johannesburg CBD with deterministic offset per driver
                base_lat = -26.2041 + _seed_offset(d.id, 0.25) - 0.125
                base_lng = 28.0473 + _seed_offset(d.id + "x", 0.25) - 0.125

            phase = (now / 30.0) + _seed_offset(d.id, 6.28)
            wobble_lat = math.sin(phase) * 0.004
            wobble_lng = math.cos(phase) * 0.004
            lat = base_lat + wobble_lat
            lng = base_lng + wobble_lng

            speed_kmh = 0
            status = "idle"
            if active_job:
                speed_kmh = 35 + int(15 * (math.sin(phase * 1.7) + 1) / 2)
                status = "on_route"
            if d.blocked:
                status = "blocked"
                speed_kmh = 0

            result.append({
                "driver_id": d.id,
                "driver_name": d.name,
                "vehicle_type": d.vehicle_type,
                "status": status,
                "blocked": bool(d.blocked),
                "lat": lat,
                "lng": lng,
                "speed_kmh": speed_kmh,
                "progress_pct": progress_pct,
                "active_job_id": active_job.id if active_job else None,
                "active_job_area": active_job.area if active_job else None,
                "stops_total": len(stops),
                "stops_completed": len(completed_stops),
                "next_stop": (
                    {
                        "id": target_stop.id,
                        "customer_name": target_stop.customer_name,
                        "address": target_stop.address,
                        "lat": target_stop.lat,
                        "lng": target_stop.lng,
                    }
                    if target_stop and not target_stop.completed
                    else None
                ),
            })

        # Recent alerts for the live ops sidebar
        recent_alerts = (
            db.query(Alert)
            .filter(Alert.company_id == g.company_id)
            .order_by(Alert.created_at.desc())
            .limit(8)
            .all()
        )

        return jsonify({
            "drivers": result,
            "recent_alerts": [a.to_dict() for a in recent_alerts],
            "server_time": datetime.now(timezone.utc).isoformat(),
        })
    finally:
        db.close()

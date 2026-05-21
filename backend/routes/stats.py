from datetime import datetime, timezone, timedelta

from flask import jsonify, g

from routes import stats_bp
from middleware import require_auth, require_admin
from models import Job, Driver, Stop, SafetyEvent, Alert, Device
from utils import get_db_session


def _today_utc_start():
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, now.day, tzinfo=timezone.utc)


@stats_bp.route("/api/stats", methods=["GET"])
@require_auth
@require_admin
def get_stats():
    db = get_db_session()
    try:
        jobs = db.query(Job).filter(Job.company_id == g.company_id).all()
        drivers = db.query(Driver).filter(Driver.company_id == g.company_id).all()
        events = db.query(SafetyEvent).filter(SafetyEvent.company_id == g.company_id).all()
        devices = db.query(Device).filter(Device.company_id == g.company_id).all()

        total_jobs = len(jobs)
        unassigned = len([j for j in jobs if j.status == "unassigned"])
        assigned = len([j for j in jobs if j.status == "assigned"])
        completed = len([j for j in jobs if j.status == "completed"])
        total_stops = sum(j.total_stops for j in jobs)
        total_distance = sum(j.total_distance_km for j in jobs)
        total_cost = sum(j.estimated_cost for j in jobs)

        # Active drivers = not blocked and assigned to at least one active job
        assigned_driver_ids = {j.driver_id for j in jobs if j.driver_id and j.status == "assigned"}
        active_drivers = len([d for d in drivers if not d.blocked and d.id in assigned_driver_ids])

        # Stops completed today
        today = _today_utc_start()
        all_stops = db.query(Stop).filter(Stop.company_id == g.company_id).all()
        stops_today = [s for s in all_stops if s.completed_at and s.completed_at.replace(tzinfo=timezone.utc) >= today]
        on_time_today = [s for s in stops_today if not s.time_window_end or s.completed_at.strftime("%H:%M") <= s.time_window_end]
        on_time_rate = int(len(on_time_today) / len(stops_today) * 100) if stops_today else 98

        # Fleet safety score
        if drivers:
            per_driver_events = {}
            for e in events:
                per_driver_events.setdefault(e.driver_id, []).append(e)
            scores = []
            for d in drivers:
                d_events = per_driver_events.get(d.id, [])
                penalty = sum(e.severity * 4 for e in d_events)
                scores.append(max(0, 100 - penalty))
            fleet_safety_score = int(sum(scores) / len(scores))
        else:
            fleet_safety_score = 100

        # Areas breakdown
        area_map = {}
        for j in jobs:
            area = j.area or "Unknown"
            area_map.setdefault(area, {"area": area, "jobs": 0, "stops": 0, "distance_km": 0})
            area_map[area]["jobs"] += 1
            area_map[area]["stops"] += j.total_stops or 0
            area_map[area]["distance_km"] += j.total_distance_km or 0
        areas = sorted(area_map.values(), key=lambda x: x["stops"], reverse=True)[:6]
        for a in areas:
            a["distance_km"] = round(a["distance_km"], 1)

        unread_alerts = db.query(Alert).filter(
            Alert.company_id == g.company_id,
            Alert.is_read == False,
        ).count()

        return jsonify({
            "total_jobs": total_jobs,
            "unassigned": unassigned,
            "assigned": assigned,
            "completed": completed,
            "total_stops": total_stops,
            "stops_today": len(stops_today),
            "total_distance_km": round(total_distance, 1),
            "total_estimated_cost": round(total_cost, 2),
            "total_drivers": len(drivers),
            "active_drivers": active_drivers,
            "on_time_rate": on_time_rate,
            "fleet_safety_score": fleet_safety_score,
            "total_devices": len(devices),
            "online_devices": len([d for d in devices if d.status == "online"]),
            "unread_alerts": unread_alerts,
            "areas": areas,
        })
    finally:
        db.close()

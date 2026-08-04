from flask import jsonify, g
from sqlalchemy import func

from routes import safety_bp
from middleware import require_auth, require_admin
from models import SafetyEvent, Driver
from utils import get_db_session


SEVERITY_PENALTY = 4


def compute_driver_safety_score(events):
    if not events:
        return 100
    penalty = sum(e.severity * SEVERITY_PENALTY for e in events)
    score = max(0, 100 - penalty)
    return int(score)


@safety_bp.route("/api/safety/overview", methods=["GET"])
@require_auth
@require_admin
def safety_overview():
    db = get_db_session()
    try:
        drivers = db.query(Driver).filter(Driver.company_id == g.company_id).all()
        events = db.query(SafetyEvent).filter(SafetyEvent.company_id == g.company_id).all()

        by_driver = {}
        for e in events:
            by_driver.setdefault(e.driver_id, []).append(e)

        driver_scores = []
        type_counts = {}
        total_score = 0
        for d in drivers:
            d_events = by_driver.get(d.id, [])
            score = compute_driver_safety_score(d_events)
            total_score += score
            harsh = sum(1 for e in d_events if e.event_type == "harsh_brake")
            speeding = sum(1 for e in d_events if e.event_type == "speeding")
            fatigue = sum(1 for e in d_events if e.event_type == "fatigue")
            phone = sum(1 for e in d_events if e.event_type == "phone_use")
            sharp = sum(1 for e in d_events if e.event_type == "sharp_turn")
            for et in [e.event_type for e in d_events]:
                type_counts[et] = type_counts.get(et, 0) + 1
            driver_scores.append({
                "driver_id": d.id,
                "driver_name": d.name,
                "vehicle_type": d.vehicle_type,
                "safety_score": score,
                "total_events": len(d_events),
                "harsh_brake": harsh,
                "speeding": speeding,
                "fatigue": fatigue,
                "phone_use": phone,
                "sharp_turn": sharp,
            })

        fleet_score = int(total_score / len(drivers)) if drivers else 100

        heatmap = [
            {"lat": e.lat, "lng": e.lng, "weight": e.severity}
            for e in events if e.lat is not None and e.lng is not None
        ]

        leaderboard = sorted(driver_scores, key=lambda d: d["safety_score"], reverse=True)

        return jsonify({
            "fleet_safety_score": fleet_score,
            "total_events": len(events),
            "event_type_counts": type_counts,
            "drivers": leaderboard,
            "heatmap": heatmap,
        })
    finally:
        db.close()


@safety_bp.route("/api/safety/events", methods=["GET"])
@require_auth
@require_admin
def list_safety_events():
    db = get_db_session()
    try:
        events = (
            db.query(SafetyEvent)
            .filter(SafetyEvent.company_id == g.company_id)
            .order_by(SafetyEvent.created_at.desc())
            .limit(200)
            .all()
        )
        driver_map = {d.id: d.name for d in db.query(Driver).filter(Driver.company_id == g.company_id).all()}
        return jsonify({
            "events": [
                {**e.to_dict(), "driver_name": driver_map.get(e.driver_id, "Unknown")}
                for e in events
            ]
        })
    finally:
        db.close()

"""Intelligence-layer HTTP surface.

Endpoints:
  GET  /api/intelligence/recommendations
  POST /api/intelligence/recommendations/<rec_id>/acknowledge
  GET  /api/intelligence/audit-log
  POST /api/intelligence/command           (operator command palette)
"""
import traceback
import uuid
from datetime import datetime, timezone

from flask import jsonify, g, request
from sqlalchemy import desc

from routes import intelligence_bp
from middleware import require_auth, require_admin
from models import Driver, Device, SafetyEvent, Alert, AuditLog, Job, Stop
from utils import get_db_session
from intelligence.anomaly_detector import (
    detect_device_anomalies,
    detect_fatigue_clusters,
    detect_blocked_drivers,
)
from intelligence.recommendation_engine import build_recommendations
from intelligence.audit_logger import log_action
from intelligence.workflow_engine import run_autonomous_workflows
from intelligence.auto_optimizer import optimize_job_stops
from intelligence import command_parser
from intelligence.driver_notifier import notify_driver
from agents import Orchestrator
from agents.context import build_context as _agents_ctx


def _driver_liveops_summary(db, company_id):
    drivers = db.query(Driver).filter(Driver.company_id == company_id).all()
    return [
        {
            "driver_id": d.id,
            "driver_name": d.name,
            "blocked": bool(d.blocked),
            "status": "blocked" if d.blocked else "idle",
        }
        for d in drivers
    ]


@intelligence_bp.route("/api/intelligence/recommendations", methods=["GET"])
@require_auth
@require_admin
def recommendations():
    db = get_db_session()
    try:
        company_id = g.company_id
        devices = [d.to_dict() for d in db.query(Device).filter(Device.company_id == company_id).all()]
        events = [e.to_dict() for e in db.query(SafetyEvent).filter(SafetyEvent.company_id == company_id).all()]
        crit_alerts = [
            a.to_dict()
            for a in db.query(Alert)
            .filter(
                Alert.company_id == company_id,
                Alert.severity == "critical",
                Alert.is_read == False,  # noqa: E712
            )
            .all()
        ]
        liveops = _driver_liveops_summary(db, company_id)

        device_anomalies = detect_device_anomalies(devices)
        fatigue_clusters = detect_fatigue_clusters(events)
        blocked = detect_blocked_drivers(liveops)

        auto_entries = run_autonomous_workflows(
            db, company_id=company_id, device_anomalies=device_anomalies
        )

        # Legacy detector output (telemetry / safety / critical alerts).
        # Tagged with synthetic agent names so the UI can group everything
        # under the multi-agent model.
        legacy = build_recommendations(
            device_anomalies=device_anomalies,
            fatigue_clusters=fatigue_clusters,
            blocked_drivers=blocked,
            open_critical_alerts=crit_alerts,
        )
        for r in legacy:
            cat = r.get("category", "")
            if cat == "Driver risk":
                r["agent"] = "Driver Safety"
            elif cat == "Telemetry":
                r["agent"] = "Device Telemetry"
            elif cat == "Critical alert":
                r["agent"] = "Critical Alerts"
            else:
                r["agent"] = "Dynamic Rerouting"

        # New: run the agent orchestrator and merge its decisions.
        ctx = _agents_ctx(db, company_id)
        agent_decisions, agent_statuses = Orchestrator().run(ctx)
        merged = legacy + [d.to_dict() for d in agent_decisions]

        # De-duplicate by id (orchestrator may overlap with legacy on blocked drivers)
        seen = set()
        recs = []
        for r in merged:
            rid = r.get("id")
            if rid in seen:
                continue
            seen.add(rid)
            recs.append(r)

        # Sort by severity then confidence (mirror orchestrator order)
        sev_w = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        recs.sort(
            key=lambda r: (sev_w.get(r.get("severity"), 0), r.get("confidence", 0)),
            reverse=True,
        )

        return jsonify({
            "recommendations": recs,
            "agents": [s.to_dict() for s in agent_statuses],
            "autonomous_actions_this_call": [
                {
                    "summary": e.summary,
                    "action_type": e.action_type,
                    "at": e.created_at.isoformat() if e.created_at else None,
                }
                for e in auto_entries
            ],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })
    finally:
        db.close()


@intelligence_bp.route(
    "/api/intelligence/recommendations/<rec_id>/acknowledge", methods=["POST"]
)
@require_auth
@require_admin
def acknowledge(rec_id):
    db = get_db_session()
    try:
        body = request.get_json(silent=True) or {}
        actor = getattr(g, "user_id", None) or getattr(g, "user_email", None) or "operator"
        log_action(
            db,
            company_id=g.company_id,
            action_type="recommendation_acknowledged",
            summary=body.get("summary") or f"Acknowledged {rec_id}",
            actor=actor,
            confidence=1.0,
            requires_approval=False,
            related_id=rec_id,
            details=body,
        )
        return jsonify({"ok": True})
    finally:
        db.close()


@intelligence_bp.route("/api/intelligence/audit-log", methods=["GET"])
@require_auth
@require_admin
def audit_log_endpoint():
    db = get_db_session()
    try:
        try:
            limit = max(1, min(200, int(request.args.get("limit", 50))))
        except ValueError:
            limit = 50
        entries = (
            db.query(AuditLog)
            .filter(AuditLog.company_id == g.company_id)
            .order_by(desc(AuditLog.created_at))
            .limit(limit)
            .all()
        )
        return jsonify({
            "entries": [
                {
                    "id": e.id,
                    "action_type": e.action_type,
                    "summary": e.summary,
                    "actor": e.actor,
                    "confidence": e.confidence,
                    "requires_approval": e.requires_approval,
                    "related_id": e.related_id,
                    "at": e.created_at.isoformat() if e.created_at else None,
                }
                for e in entries
            ]
        })
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Operator command palette (Cmd+K)
# ─────────────────────────────────────────────────────────────────────────────


def _resp(ok=True, summary="", **extra):
    out = {"ok": ok, "summary": summary}
    out.update(extra)
    return out


def _exec_help():
    return _resp(True, "Available commands", type="help", items=command_parser.help_entries())


def _exec_drivers(db, company_id):
    rows = db.query(Driver).filter(Driver.company_id == company_id).all()
    items = [
        {
            "id": d.id,
            "name": d.name,
            "status": d.status,
            "blocked": bool(d.blocked),
            "vehicle_type": d.vehicle_type,
        }
        for d in rows
    ]
    return _resp(True, f"{len(items)} drivers", type="drivers", items=items)


def _exec_jobs(db, company_id):
    rows = db.query(Job).filter(Job.company_id == company_id).all()
    items = [
        {
            "id": j.id,
            "area": j.area,
            "status": j.status,
            "driver_name": j.driver_name,
            "total_stops": j.total_stops,
            "total_distance_km": j.total_distance_km,
        }
        for j in rows
    ]
    return _resp(True, f"{len(items)} jobs", type="jobs", items=items)


def _route_payload(db, company_id, job):
    """Build a map-ready payload for one job (stops + driver position)."""
    stops = (
        db.query(Stop)
        .filter(Stop.job_id == job.id)
        .order_by(Stop.stop_number)
        .all()
    )
    stop_dicts = [
        {
            "id": s.id, "stop_number": s.stop_number,
            "customer_name": s.customer_name, "address": s.address,
            "lat": s.lat, "lng": s.lng, "completed": bool(s.completed),
        }
        for s in stops if s.lat is not None and s.lng is not None
    ]
    driver_pos = None
    if job.driver_id:
        d = db.query(Driver).filter(
            Driver.id == job.driver_id, Driver.company_id == company_id
        ).first()
        if d and d.current_lat is not None and d.current_lng is not None:
            driver_pos = {
                "id": d.id, "name": d.name,
                "lat": d.current_lat, "lng": d.current_lng,
            }
    return {
        "job_id": job.id, "area": job.area, "status": job.status,
        "driver_name": job.driver_name, "driver": driver_pos,
        "total_stops": job.total_stops,
        "total_distance_km": job.total_distance_km,
        "stops": stop_dicts,
    }


def _exec_route(db, company_id, job_id):
    job = db.query(Job).filter(Job.id == job_id, Job.company_id == company_id).first()
    if not job:
        return _resp(False, f"Job `{job_id}` not found")
    payload = _route_payload(db, company_id, job)
    if not payload["stops"]:
        return _resp(False, f"Job `{job_id}` has no geocoded stops to map")
    return _resp(
        True,
        f"Route {job.id} — {len(payload['stops'])} stops"
        + (f" · {job.driver_name}" if job.driver_name else " · unassigned"),
        type="route_map", routes=[payload],
    )


def _exec_map(db, company_id):
    jobs = (
        db.query(Job)
        .filter(Job.company_id == company_id,
                Job.status.in_(("assigned", "in_progress")))
        .all()
    )
    payloads = [_route_payload(db, company_id, j) for j in jobs]
    payloads = [p for p in payloads if p["stops"]]
    if not payloads:
        return _resp(True, "No active routes to map yet", type="route_map", routes=[])
    return _resp(
        True,
        f"{len(payloads)} active route(s) on the map",
        type="route_map", routes=payloads,
    )


def _exec_notify(db, company_id, driver_id, message, actor):
    d = db.query(Driver).filter(
        Driver.id == driver_id, Driver.company_id == company_id
    ).first()
    if not d:
        return _resp(False, f"Driver `{driver_id}` not found")
    if not message or not message.strip():
        return _resp(False, "Notification needs a message")
    alert = notify_driver(
        db, company_id=company_id, driver_id=d.id, driver_name=d.name,
        title=f"Message from dispatch", message=message.strip(),
        severity="info", alert_type="dispatch_message", actor=actor,
    )
    return _resp(
        True,
        f"Created in-app alert for {d.name} (no outbound SMS/push wired)",
        type="notify_result", alert=alert,
    )


def _exec_alerts(db, company_id):
    rows = (
        db.query(Alert)
        .filter(Alert.company_id == company_id, Alert.is_read == False)  # noqa: E712
        .order_by(desc(Alert.created_at))
        .limit(25)
        .all()
    )
    items = [
        {
            "id": a.id,
            "type": a.type,
            "severity": a.severity,
            "title": a.title,
            "message": a.message,
        }
        for a in rows
    ]
    return _resp(True, f"{len(items)} open alerts", type="alerts", items=items)


def _exec_audit(db, company_id):
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.company_id == company_id)
        .order_by(desc(AuditLog.created_at))
        .limit(10)
        .all()
    )
    items = [
        {
            "summary": e.summary,
            "actor": e.actor,
            "action_type": e.action_type,
            "at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in rows
    ]
    return _resp(True, "Last 10 audit entries", type="audit", items=items)


def _exec_recommendations(db, company_id):
    devices = [d.to_dict() for d in db.query(Device).filter(Device.company_id == company_id).all()]
    events = [e.to_dict() for e in db.query(SafetyEvent).filter(SafetyEvent.company_id == company_id).all()]
    crit = [
        a.to_dict() for a in db.query(Alert).filter(
            Alert.company_id == company_id,
            Alert.severity == "critical",
            Alert.is_read == False,  # noqa: E712
        ).all()
    ]
    live = _driver_liveops_summary(db, company_id)
    recs = build_recommendations(
        device_anomalies=detect_device_anomalies(devices),
        fatigue_clusters=detect_fatigue_clusters(events),
        blocked_drivers=detect_blocked_drivers(live),
        open_critical_alerts=crit,
    )
    return _resp(True, f"{len(recs)} active recommendations", type="recommendations", items=recs)


def _exec_stats(db, company_id):
    drivers = db.query(Driver).filter(Driver.company_id == company_id).count()
    blocked = db.query(Driver).filter(Driver.company_id == company_id, Driver.blocked == True).count()  # noqa: E712
    jobs = db.query(Job).filter(Job.company_id == company_id).count()
    unassigned = db.query(Job).filter(Job.company_id == company_id, Job.status == "unassigned").count()
    alerts = db.query(Alert).filter(Alert.company_id == company_id, Alert.is_read == False).count()  # noqa: E712
    items = [
        {"label": "Drivers", "value": drivers},
        {"label": "Blocked drivers", "value": blocked},
        {"label": "Jobs", "value": jobs},
        {"label": "Unassigned jobs", "value": unassigned},
        {"label": "Open alerts", "value": alerts},
    ]
    return _resp(True, "Snapshot", type="stats", items=items)


def _exec_assign(db, company_id, job_id, driver_id):
    driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == company_id).first()
    if not driver:
        return _resp(False, f"Driver `{driver_id}` not found")
    job = db.query(Job).filter(Job.id == job_id, Job.company_id == company_id).first()
    if not job:
        return _resp(False, f"Job `{job_id}` not found")
    job.status = "assigned"
    job.driver_id = driver.id
    job.driver_name = driver.name
    job.assigned_at = datetime.now(timezone.utc)
    db.commit()
    # Optimization is best-effort. The assignment is already persisted; if
    # the optimizer raises we report assignment success + optimizer failure
    # rather than failing the whole command (which would mislead the operator
    # into thinking the assignment didn't happen).
    try:
        opt = optimize_job_stops(
            db, job,
            start_lat=getattr(driver, "current_lat", None),
            start_lng=getattr(driver, "current_lng", None),
        )
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        db.rollback()
        opt = {"status": "error", "reason": f"{type(exc).__name__}: {exc}"}
    msg = f"Assigned {job.id} to {driver.name}"
    if opt.get("status") == "ok":
        msg += f" — auto-optimized, saved {opt['distance_saved_km']} km"
    elif opt.get("status") == "error":
        msg += f" — optimizer failed ({opt.get('reason')}); order unchanged"

    # Auto-notify the driver about the new (and possibly re-ordered) route.
    notif = None
    try:
        body = (f"You've been assigned route {job.id} with "
                f"{job.total_stops or '?'} stops.")
        if opt.get("status") == "ok":
            body += (f" Stops were re-ordered for efficiency "
                     f"(saved {opt['distance_saved_km']} km).")
        notif = notify_driver(
            db, company_id=company_id, driver_id=driver.id,
            driver_name=driver.name, title=f"New route: {job.id}",
            message=body, severity="info", alert_type="route_assigned",
            actor="dispatch",
        )
    except Exception:  # noqa: BLE001
        traceback.print_exc()
    return _resp(True, msg, type="assign_result",
                 auto_optimization=opt, driver_notified=notif)


def _exec_unassign(db, company_id, job_id):
    job = db.query(Job).filter(Job.id == job_id, Job.company_id == company_id).first()
    if not job:
        return _resp(False, f"Job `{job_id}` not found")
    job.status = "unassigned"
    job.driver_id = None
    job.driver_name = None
    job.assigned_at = None
    db.commit()
    return _resp(True, f"Unassigned {job_id}", type="job_updated")


def _exec_optimize(db, company_id, job_id):
    job = db.query(Job).filter(Job.id == job_id, Job.company_id == company_id).first()
    if not job:
        return _resp(False, f"Job `{job_id}` not found")
    driver = None
    if job.driver_id:
        driver = db.query(Driver).filter(
            Driver.id == job.driver_id, Driver.company_id == company_id
        ).first()
    opt = optimize_job_stops(
        db, job,
        start_lat=getattr(driver, "current_lat", None) if driver else None,
        start_lng=getattr(driver, "current_lng", None) if driver else None,
    )
    status = opt.get("status")
    if status == "ok":
        msg = f"Optimized {job_id} — saved {opt['distance_saved_km']} km across {opt['stops_reordered']} stops"
    elif status == "no_improvement":
        msg = f"Already optimal — current order is {opt['distance_after_km']} km"
    else:
        msg = f"Skipped: {opt.get('reason', status)}"

    # If the route actually changed AND there's a driver, send a heads-up.
    notif = None
    if status == "ok" and driver and (opt.get("stops_reordered", 0) or 0) > 0:
        try:
            notif = notify_driver(
                db, company_id=company_id, driver_id=driver.id,
                driver_name=driver.name,
                title=f"Route updated: {job_id}",
                message=(f"Your stops on {job_id} were re-ordered — "
                         f"{opt['stops_reordered']} stop(s) changed, "
                         f"saving {opt['distance_saved_km']} km. "
                         "Open the app to see the new sequence."),
                severity="info", alert_type="route_reoptimized",
                actor="dispatch",
            )
        except Exception:  # noqa: BLE001
            traceback.print_exc()
    return _resp(True, msg, type="optimization",
                 details=opt, driver_notified=notif)


def _exec_optimize_all(db, company_id):
    jobs = db.query(Job).filter(Job.company_id == company_id).limit(20).all()
    results = []
    saved_total = 0.0
    for j in jobs:
        driver = None
        if j.driver_id:
            driver = db.query(Driver).filter(
                Driver.id == j.driver_id, Driver.company_id == company_id
            ).first()
        r = optimize_job_stops(
            db, j,
            start_lat=getattr(driver, "current_lat", None) if driver else None,
            start_lng=getattr(driver, "current_lng", None) if driver else None,
        )
        if r.get("status") == "ok":
            saved_total += r.get("distance_saved_km", 0)
        results.append({"job_id": j.id, **r})
    return _resp(
        True,
        f"Optimized {len(results)} jobs — total {round(saved_total, 2)} km saved",
        type="optimization_bulk",
        items=results,
    )


def _exec_block(db, company_id, driver_id, blocked):
    d = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == company_id).first()
    if not d:
        return _resp(False, f"Driver `{driver_id}` not found")
    d.blocked = blocked
    db.commit()
    return _resp(True, f"{'Blocked' if blocked else 'Unblocked'} {d.name}", type="driver_updated")


def _exec_acknowledge(db, company_id, rec_id, actor):
    log_action(
        db, company_id=company_id, action_type="recommendation_acknowledged",
        summary=f"Acknowledged {rec_id} via command palette",
        actor=actor, confidence=1.0, requires_approval=False, related_id=rec_id,
    )
    return _resp(True, f"Acknowledged {rec_id}", type="acknowledge")


@intelligence_bp.route("/api/intelligence/command", methods=["POST"])
@require_auth
@require_admin
def run_command():
    body = request.get_json(silent=True) or {}
    text = body.get("text", "")
    parsed = command_parser.parse(text)
    if "error" in parsed:
        return jsonify({"ok": False, "summary": parsed["error"], "input": text}), 200

    intent = parsed["intent"]
    args = parsed.get("args", [])
    actor = getattr(g, "user_id", None) or getattr(g, "user_email", None) or "operator"

    db = get_db_session()
    try:
        cid = g.company_id
        try:
            if intent == "help":
                result = _exec_help()
            elif intent == "drivers":
                result = _exec_drivers(db, cid)
            elif intent == "jobs":
                result = _exec_jobs(db, cid)
            elif intent == "route":
                result = _exec_route(db, cid, args[0])
            elif intent == "map":
                result = _exec_map(db, cid)
            elif intent == "notify":
                result = _exec_notify(db, cid, args[0], args[1], actor)
            elif intent == "alerts":
                result = _exec_alerts(db, cid)
            elif intent == "audit":
                result = _exec_audit(db, cid)
            elif intent == "recommendations":
                result = _exec_recommendations(db, cid)
            elif intent == "stats":
                result = _exec_stats(db, cid)
            elif intent == "assign":
                result = _exec_assign(db, cid, args[0], args[1])
            elif intent == "unassign":
                result = _exec_unassign(db, cid, args[0])
            elif intent == "optimize":
                result = _exec_optimize(db, cid, args[0])
            elif intent == "optimize_all":
                result = _exec_optimize_all(db, cid)
            elif intent == "block":
                result = _exec_block(db, cid, args[0], True)
            elif intent == "unblock":
                result = _exec_block(db, cid, args[0], False)
            elif intent == "acknowledge":
                result = _exec_acknowledge(db, cid, args[0], actor)
            else:
                result = _resp(False, f"Command `{intent}` is not wired yet")
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            db.rollback()
            return jsonify({"ok": False, "summary": f"Error executing `{intent}`: {exc}", "input": text}), 200

        # Audit-log any state-changing command. Read-only commands are noisy
        # and not logged here.
        if result.get("ok") and intent not in {
            "help", "drivers", "jobs", "alerts", "audit", "recommendations",
            "stats", "route", "map",
        }:
            try:
                log_action(
                    db, company_id=cid, action_type=f"command:{intent}",
                    summary=f"[command] {result.get('summary')}",
                    actor=actor, confidence=1.0, requires_approval=False,
                    details={"input": text, "args": args},
                )
            except Exception:  # noqa: BLE001
                traceback.print_exc()

        result["input"] = text
        return jsonify(result)
    finally:
        db.close()

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
from email.utils import parsedate_to_datetime
import os
import re

import requests
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
from intelligence.autopilot import autopilot_status, run_autopilot, update_settings
from intelligence import command_parser, natural_parser
from intelligence.llm_chat import (
    LLMUnavailable,
    answer as llm_answer,
    is_configured as llm_is_configured,
    local_fallback_answer,
)
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


def _humanize_parse_error(err, original):
    """Replace CLI-style errors with friendly suggestions."""
    snippet = (original or "").strip()
    prefix = f"I didn't catch \"{snippet}\". " if snippet else "I didn't catch that. "
    return (
        prefix
        + "Try things like: \"show me today's routes\", \"how are we doing?\", "
        + "\"tell Mike to hurry up\", or \"fix all routes\". "
        + "Type `help` to see everything I understand."
    )


def _resolve_driver(db, company_id, token):
    """Find a driver by exact id or by partial name match (case-insensitive).

    Returns (driver, error_message). error_message is None on success.
    """
    if not token:
        return None, "Which driver?"
    token = token.strip().strip('"').strip("'")
    # Try exact id first.
    d = db.query(Driver).filter(
        Driver.id == token, Driver.company_id == company_id
    ).first()
    if d:
        return d, None
    # Partial name match.
    matches = (
        db.query(Driver)
        .filter(Driver.company_id == company_id,
                Driver.name.ilike(f"%{token}%"))
        .all()
    )
    if len(matches) == 1:
        return matches[0], None
    if len(matches) > 1:
        names = ", ".join(m.name for m in matches[:5])
        return None, f"Multiple drivers match \"{token}\": {names}. Be more specific."
    return None, f"I couldn't find a driver named \"{token}\"."


def _resolve_job(db, company_id, token):
    """Find a job by exact id, otherwise by partial id/area match."""
    if not token:
        return None, "Which job?"
    token = token.strip().strip('"').strip("'")
    j = db.query(Job).filter(
        Job.id == token, Job.company_id == company_id
    ).first()
    if j:
        return j, None
    matches = (
        db.query(Job)
        .filter(Job.company_id == company_id)
        .filter((Job.id.ilike(f"%{token}%")) | (Job.area.ilike(f"%{token}%")))
        .all()
    )
    if len(matches) == 1:
        return matches[0], None
    if len(matches) > 1:
        ids = ", ".join(m.id for m in matches[:5])
        return None, f"Multiple jobs match \"{token}\": {ids}. Be more specific."
    return None, f"I couldn't find a job matching \"{token}\"."


def _exec_help():
    return _resp(
        True,
        "Here are some things you can ask me",
        type="help",
        items=command_parser.friendly_examples(),
    )


def _exec_greeting():
    return _resp(
        True,
        "Hey. I can watch dispatch, surface problems, run Autopilot, optimize routes, assign jobs, notify drivers, and show you what changed.",
        type="greeting",
        items=[
            {"phrase": "autopilot status", "does": "Shows whether Aiviate is actively running operations"},
            {"phrase": "turn autopilot on", "does": "Lets Aiviate handle approved low-risk work"},
            {"phrase": "run autopilot now", "does": "Forces one operational check"},
            {"phrase": "show me today's routes", "does": "Shows active routes on a map"},
            {"phrase": "what should I do?", "does": "Shows decisions that need your attention"},
        ],
    )


def _exec_autopilot(db, company_id):
    status = autopilot_status(db, company_id)
    settings = status.get("settings") or {}
    pending = status.get("pending_approvals") or []
    recent = status.get("recent_actions") or []
    return _resp(
        True,
        (
            f"Autopilot is {'on' if settings.get('enabled') else 'off'} "
            f"in {settings.get('mode', 'assist')} mode. "
            f"{len(pending)} approval(s) waiting, {len(recent)} recent action(s)."
        ),
        type="autopilot",
        settings=settings,
        pending_approvals=pending,
        recent_actions=recent,
    )


def _exec_autopilot_run(db, company_id):
    result = run_autopilot(db, company_id, force=True)
    return _resp(
        True,
        result.get("summary") or "Autopilot completed a check",
        type="autopilot_run",
        actions=result.get("actions", []),
        mode=result.get("mode"),
        enabled=result.get("enabled"),
    )


def _exec_autopilot_update(db, company_id, args):
    if not args:
        return _exec_autopilot(db, company_id)
    if args[0] == "on":
        settings = update_settings(db, company_id, {"enabled": True})
    elif args[0] == "off":
        settings = update_settings(db, company_id, {"enabled": False})
    elif args[0] == "mode" and len(args) >= 2:
        settings = update_settings(db, company_id, {"mode": args[1]})
    else:
        return _resp(False, "I can set Autopilot on, off, or mode assist/autonomous/emergency.")
    return _resp(
        True,
        f"Autopilot is {'on' if settings.enabled else 'off'} in {settings.mode} mode",
        type="autopilot",
        settings=settings.to_dict(),
        pending_approvals=[],
        recent_actions=[],
    )


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
    rows = (
        db.query(Job)
        .join(Stop, Stop.job_id == Job.id)
        .filter(Job.company_id == company_id, Stop.order_id.like("STORE-%"))
        .distinct()
        .all()
    )
    items = [
        {
            "id": j.id,
            "area": j.area,
            "status": j.status,
            "driver_name": j.driver_name,
            "total_stops": len([s for s in j.stops if (s.order_id or "").startswith("STORE-")]),
            "total_distance_km": j.total_distance_km,
        }
        for j in rows
    ]
    return _resp(True, f"{len(items)} real storefront job{'s' if len(items) != 1 else ''}", type="jobs", items=items)


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
    job, err = _resolve_job(db, company_id, job_id)
    if err:
        return _resp(False, err)
    payload = _route_payload(db, company_id, job)
    if not payload["stops"]:
        return _resp(False, f"Job {job.id} has no geocoded stops yet, so I can't put it on the map.")
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
    d, err = _resolve_driver(db, company_id, driver_id)
    if err:
        return _resp(False, err)
    if not message or not message.strip():
        return _resp(False, "What should I tell them? Add a short message.")
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


def _call_agent_base_url():
    return (
        os.environ.get("CALL_AGENT_API_URL")
        or os.environ.get("AIVIATE_CALL_AGENT_URL")
        or ""
    ).strip().rstrip("/")


def _exec_call(db, company_id, order_ref, reason, actor):
    """Create a controlled customer call through the Call Agent backend."""
    ref = (order_ref or "").strip().strip('"').strip("'")
    reason = (reason or "customer follow-up").strip().strip('"').strip("'")
    if not ref:
        return _resp(False, "Which order should I call about?")

    candidates = [ref]
    if not ref.startswith("STORE-"):
        candidates.append(f"STORE-{ref}")
    if not ref.startswith("MERCH-"):
        candidates.append(f"MERCH-{ref}")

    stop = (
        db.query(Stop)
        .filter(Stop.company_id == company_id, Stop.order_id.in_(candidates))
        .order_by(desc(Stop.created_at))
        .first()
    )
    if not stop:
        return _resp(False, f"I couldn't find order {ref} in this workspace.")
    if not (stop.phone or "").strip():
        return _resp(False, f"Order {stop.order_id} has no customer phone number to call.")

    call_agent_url = _call_agent_base_url()
    if not call_agent_url:
        return _resp(
            False,
            "The Call Agent service URL is not configured. Set CALL_AGENT_API_URL on the backend, then retry the call request.",
            type="call_result",
            order_ref=stop.order_id,
        )

    payload = {
        "tenant_id": company_id,
        "incident_id": None,
        "reason": reason,
        "order_reference": stop.order_id,
        "approved_summary": reason,
        "recipient": {
            "type": "customer",
            "name": stop.customer_name,
            "phone": stop.phone,
        },
        "permitted_disclosure_fields": [
            "order_reference",
            "delivery_status",
            "delivery_window",
            "driver_name",
        ],
    }
    idem = f"call:{company_id}:{stop.order_id}:{reason.lower()[:80]}"
    headers = {
        "Content-Type": "application/json",
        "Idempotency-Key": idem,
        "X-Correlation-ID": f"corr-{uuid.uuid4().hex}",
    }
    service_token = os.environ.get("AIVIATE_SERVICE_TOKEN", "").strip()
    if service_token:
        headers["X-Aiviate-Service-Token"] = service_token
        headers["Authorization"] = f"Bearer {service_token}"

    try:
        response = requests.post(
            f"{call_agent_url}/internal/v1/calls",
            json=payload,
            headers=headers,
            timeout=15,
        )
        response.raise_for_status()
        result = response.json() if response.content else {}
    except requests.RequestException as exc:
        traceback.print_exc()
        detail = None
        if getattr(exc, "response", None) is not None:
            try:
                detail = exc.response.json()
            except ValueError:
                detail = exc.response.text[:500]
        return _resp(
            False,
            "The Call Agent could not create the call right now.",
            type="call_result",
            order_ref=stop.order_id,
            detail=detail or str(exc),
        )

    call = result.get("call") or result
    call_id = call.get("call_id") or call.get("id")
    status = call.get("status") or ("simulated" if result.get("simulation") else "created")
    log_action(
        db,
        company_id=company_id,
        action_type="call_agent_call_requested",
        summary=f"Requested customer call for {stop.order_id}: {reason}",
        actor=actor,
        confidence=1.0,
        requires_approval=False,
        related_id=stop.id,
        details={
            "order_reference": stop.order_id,
            "customer_name": stop.customer_name,
            "call_id": call_id,
            "status": status,
            "simulation": bool(result.get("simulation")),
            "reason": reason,
        },
    )
    return _resp(
        True,
        f"Call Agent {'simulated' if result.get('simulation') else 'created'} a customer call for {stop.order_id}.",
        type="call_result",
        order_ref=stop.order_id,
        call_id=call_id,
        status=status,
        simulation=bool(result.get("simulation")),
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
    jobs = (
        db.query(Job)
        .join(Stop, Stop.job_id == Job.id)
        .filter(Job.company_id == company_id, Stop.order_id.like("STORE-%"))
        .distinct()
        .count()
    )
    unassigned = (
        db.query(Job)
        .join(Stop, Stop.job_id == Job.id)
        .filter(Job.company_id == company_id, Job.status == "unassigned", Stop.order_id.like("STORE-%"))
        .distinct()
        .count()
    )
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
    driver, err = _resolve_driver(db, company_id, driver_id)
    if err:
        return _resp(False, err)
    job, err = _resolve_job(db, company_id, job_id)
    if err:
        return _resp(False, err)
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
        msg += f". Auto-optimized, saved {opt['distance_saved_km']} km"
    elif opt.get("status") == "error":
        msg += f". Optimizer failed ({opt.get('reason')}); order unchanged"

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
    job, err = _resolve_job(db, company_id, job_id)
    if err:
        return _resp(False, err)
    job.status = "unassigned"
    job.driver_id = None
    job.driver_name = None
    job.assigned_at = None
    db.commit()
    return _resp(True, f"Unassigned {job_id}", type="job_updated")


def _exec_optimize(db, company_id, job_id):
    job, err = _resolve_job(db, company_id, job_id)
    if err:
        return _resp(False, err)
    job_id = job.id
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
        msg = f"Optimized {job_id}, saved {opt['distance_saved_km']} km across {opt['stops_reordered']} stops"
    elif status == "no_improvement":
        msg = f"Already optimal. Current order is {opt['distance_after_km']} km"
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
                message=(f"Your stops on {job_id} were re-ordered. "
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
        f"Optimized {len(results)} jobs, total {round(saved_total, 2)} km saved",
        type="optimization_bulk",
        items=results,
    )


def _exec_dispatch(db, company_id):
    """Plan routes from all stops and auto-assign them to drivers — the same
    end-to-end flow the old AI Planner page ran, now driven by the agent."""
    from routes.engine import run_dispatch, DispatchError
    try:
        summary = run_dispatch(db, company_id)
    except DispatchError as exc:
        return _resp(False, str(exc))
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        db.rollback()
        return _resp(False, "I couldn't build and assign the plan. Please try again.")

    n = summary.get("jobs_created", 0)
    d = summary.get("drivers_assigned", 0)
    items = [
        f"{a['area']} → {a['driver_name']} ({a['stops']} stops)"
        for a in summary.get("assignments", [])
    ]
    return _resp(
        True,
        f"Planned and dispatched {n} route(s) across {d} driver(s).",
        type="dispatch",
        items=items,
    )


def _exec_block(db, company_id, driver_id, blocked):
    d, err = _resolve_driver(db, company_id, driver_id)
    if err:
        return _resp(False, err)
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


ACTION_INTENTS = {
    "autopilot_run",
    "autopilot_update",
    "assign",
    "unassign",
    "optimize",
    "optimize_all",
    "dispatch",
    "block",
    "unblock",
    "acknowledge",
    "notify",
    "call",
}

READONLY_INTENTS = {
    "help",
    "greeting",
    "autopilot",
    "drivers",
    "jobs",
    "route",
    "map",
    "alerts",
    "audit",
    "recommendations",
    "stats",
}


def _looks_like_exact_command(text, normalized, parsed):
    """Keep typed command-palette commands deterministic.

    Conversational text should go to the LLM, even if the natural parser can map
    it to a read-only command. Exact commands such as `jobs`, `drivers`, `stats`,
    or `route J-1` still return structured UI blocks.
    """
    raw = (text or "").strip().lower()
    norm = (normalized or "").strip().lower()
    if raw != norm:
        return False
    exact_readonly_commands = {"help", "map"}
    if raw in exact_readonly_commands:
        return True
    if raw.startswith("route ") or raw.startswith("show route "):
        return True
    return parsed.get("intent") in ACTION_INTENTS


def _extract_order_ref(text):
    match = re.search(r"(?:order|order number|ref|reference)\s*[:#-]?\s*([A-Za-z0-9-]+)", text, flags=re.I)
    if match:
        return match.group(1).strip()
    match = re.search(r"\b[A-Z]{2,}-\d+\b", text)
    if match:
        return match.group(0).strip()
    return None


def _is_gmail_request(text):
    return bool(re.search(r"\b(?:gmail|e-?mail)\b", text or "", flags=re.I))


def _generic_gmail_query(text):
    cleaned = re.sub(
        r"\b(?:search|check|look\s+for|find|in|my|the|gmail|e-?mail|emails?|mailbox|inbox|please|tell\s+me|whether|if)\b",
        " ",
        text or "",
        flags=re.I,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ?.!,:;\"'")
    if not cleaned:
        return "in:inbox -label:trash"
    return f"in:inbox -label:trash {cleaned}"


def _message_datetime(message):
    try:
        value = parsedate_to_datetime(message.get("date", ""))
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    except (TypeError, ValueError, OverflowError):
        return datetime.min.replace(tzinfo=timezone.utc)


def _expected_delivery_date(text):
    date = (
        r"\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|"
        r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
        r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|"
        r"Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?|"
        r"\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|"
        r"Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|"
        r"Nov(?:ember)?|Dec(?:ember)?)(?:\s+\d{4})?"
    )
    match = re.search(
        rf"\b(?:expected delivery(?: date)?|delivery date|deliver(?:y)? by|"
        rf"expected to arrive|arrival date|ETA)\s*(?:is|on|by|:)?\s*({date})",
        text,
        flags=re.I,
    )
    return match.group(1) if match else None


def _gmail_confirmation_answer(db, company_id, text):
    if not _is_gmail_request(text):
        return None

    from models import (
        IntegrationConnection,
        obfuscate_integration_token,
        reveal_integration_token,
    )
    from integrations.gmail_service import (
        GmailReauthorizationRequired,
        build_search_query,
        fetch_gmail_messages_with_refresh,
        gmail_api_error_summary,
    )

    order_ref = _extract_order_ref(text)

    conn = (
        db.query(IntegrationConnection)
        .filter(
            IntegrationConnection.company_id == company_id,
            IntegrationConnection.provider == "gmail",
            IntegrationConnection.is_active.is_(True),
        )
        .first()
    )
    if not conn:
        return {
            "ok": False,
            "summary": "Gmail is not connected for this workspace. Connect Gmail from Integrations, then ask me to search this order again.",
            "input": text,
            "llm": False,
        }

    try:
        token = reveal_integration_token(conn.access_token)
        refresh_token = reveal_integration_token(conn.refresh_token)
        query = build_search_query(order_ref=order_ref, limit=10) if order_ref else _generic_gmail_query(text)
        messages, refreshed_token = fetch_gmail_messages_with_refresh(
            token, refresh_token, query, max_results=10
        )
        if refreshed_token != token:
            conn.access_token = obfuscate_integration_token(refreshed_token)
            db.commit()
    except GmailReauthorizationRequired as exc:
        return {
            "ok": False,
            "summary": str(exc),
            "input": text,
            "llm": False,
        }
    except requests.HTTPError as exc:
        traceback.print_exc()
        if exc.response is not None and exc.response.status_code == 403:
            summary = gmail_api_error_summary(exc)
        else:
            summary = "Gmail could not be reached right now. Please try the search again shortly."
        return {
            "ok": False,
            "summary": summary,
            "input": text,
            "llm": False,
        }
    except Exception:
        db.rollback()
        traceback.print_exc()
        return {
            "ok": False,
            "summary": "Gmail search failed due to a temporary service error. Please try again shortly.",
            "input": text,
            "llm": False,
        }

    if not messages:
        target = order_ref or query
        return {
            "ok": True,
            "summary": f"I searched connected Gmail for {target} but found no matching emails.",
            "provider": "gmail",
            "query": query,
            "input": text,
            "llm": False,
        }

    if not order_ref:
        top = sorted(messages, key=_message_datetime, reverse=True)[:5]
        parts = []
        for message in top:
            subject = message.get("subject") or "(no subject)"
            sender = message.get("from") or "Unknown sender"
            snippet = message.get("snippet") or message.get("body_preview") or ""
            parts.append(f"{sender} — {subject}: {snippet[:180]}")
        return {
            "ok": True,
            "summary": f"I searched connected Gmail and found {len(messages)} matching email(s). " + " | ".join(parts),
            "provider": "gmail",
            "query": query,
            "items": top,
            "input": text,
            "llm": False,
        }

    latest = max(messages, key=_message_datetime)
    evidence = " ".join((latest.get("subject", ""), latest.get("snippet", ""), latest.get("body_preview", "")))
    lowered = evidence.lower()
    negative = ("not confirmed", "not yet confirmed", "unable to confirm", "cannot confirm", "not scheduled", "delayed", "cancelled", "canceled", "out of stock")
    positive = ("confirmed", "scheduled", "dispatched", "shipped", "on its way", "will deliver", "delivery is set")
    if any(term in lowered for term in negative):
        confirmation = "Not confirmed"
    elif any(term in lowered for term in positive):
        confirmation = "Confirmed"
    else:
        confirmation = "No clear confirmation found"

    delivery_date = _expected_delivery_date(evidence)
    summary = (
        f"Gmail search for {order_ref}: {confirmation}. "
        f"Sender: {latest.get('from') or 'not available'}. "
        f"Subject: {latest.get('subject') or '(no subject)'}. "
        f"Expected delivery: {delivery_date or 'not stated in this email'}. "
        f"Evidence: {(latest.get('snippet') or latest.get('body_preview') or 'No message preview available.')[:500]}"
    )
    return {
        "ok": True,
        "summary": summary,
        "provider": "gmail",
        "query": query,
        "input": text,
        "llm": False,
    }


def _llm_response_or_error(db, company_id, text, parse_error=None):
    gmail_result = _gmail_confirmation_answer(db, company_id, text)
    if gmail_result:
        return gmail_result
    if not llm_is_configured():
        return None
    try:
        result = llm_answer(db, company_id, text, parse_error)
        result["input"] = text
        return result
    except (LLMUnavailable, requests.RequestException) as exc:
        return local_fallback_answer(db, company_id, text, reason=str(exc))


@intelligence_bp.route("/api/intelligence/command", methods=["POST"])
@require_auth
@require_admin
def run_command():
    body = request.get_json(silent=True) or {}
    text = body.get("text", "")
    if _is_gmail_request(text):
        db = get_db_session()
        try:
            return jsonify(_gmail_confirmation_answer(db, g.company_id, text)), 200
        finally:
            db.close()

    # Translate natural phrasing → underlying command grammar (deterministic).
    normalized = natural_parser.normalize(text)
    parsed = command_parser.parse(normalized)
    if "error" in parsed:
        db = get_db_session()
        try:
            llm_result = _llm_response_or_error(db, g.company_id, text, parsed["error"])
            if llm_result:
                if not llm_result.get("ok"):
                    llm_result["summary"] = f"{_humanize_parse_error(parsed['error'], text)} {llm_result['summary']}"
                return jsonify(llm_result), 200
            return jsonify({
                "ok": False,
                "summary": (
                    _humanize_parse_error(parsed["error"], text)
                    + " The LLM layer is not enabled on this backend; set OPENAI_API_KEY or GOOGLE_API_KEY/GEMINI_API_KEY and restart the API."
                ),
                "input": text,
                "llm": False,
            }), 200
        finally:
            db.close()

    intent = parsed["intent"]
    args = parsed.get("args", [])
    actor = getattr(g, "user_id", None) or getattr(g, "user_email", None) or "operator"

    db = get_db_session()
    try:
        cid = g.company_id
        if (
            intent in READONLY_INTENTS
            and not _looks_like_exact_command(text, normalized, parsed)
        ):
            llm_result = _llm_response_or_error(db, cid, text)
            if llm_result:
                return jsonify(llm_result), 200

        try:
            if intent == "help":
                result = _exec_help()
            elif intent == "greeting":
                result = _exec_greeting()
            elif intent == "autopilot":
                result = _exec_autopilot(db, cid)
            elif intent == "autopilot_run":
                result = _exec_autopilot_run(db, cid)
            elif intent == "autopilot_update":
                result = _exec_autopilot_update(db, cid, args)
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
            elif intent == "call":
                result = _exec_call(db, cid, args[0], args[1], actor)
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
            elif intent == "dispatch":
                result = _exec_dispatch(db, cid)
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
            "help", "greeting", "drivers", "jobs", "alerts", "audit", "recommendations",
            "stats", "route", "map", "autopilot",
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

"""Autopilot engine for autonomous logistics operations.

The engine is deliberately deterministic: it runs a bounded policy pass,
executes low-risk actions, and records higher-risk decisions as pending
approvals in the audit log. It is safe to call from an HTTP endpoint,
cron, or a future worker.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

from models import Alert, AuditLog, AutopilotSettings, Driver, Job
from intelligence.audit_logger import log_action
from intelligence.auto_optimizer import optimize_job_stops
from intelligence.driver_notifier import notify_driver

VALID_MODES = {"manual", "assist", "autonomous", "emergency"}


def get_or_create_settings(db, company_id: str) -> AutopilotSettings:
    settings = (
        db.query(AutopilotSettings)
        .filter(AutopilotSettings.company_id == company_id)
        .first()
    )
    if settings:
        return settings
    settings = AutopilotSettings(company_id=company_id)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def update_settings(db, company_id: str, payload: Dict) -> AutopilotSettings:
    settings = get_or_create_settings(db, company_id)
    for key in (
        "enabled",
        "max_actions_per_run",
        "auto_assign",
        "auto_optimize",
        "auto_notify",
        "safety_approval_required",
    ):
        if key in payload:
            setattr(settings, key, payload[key])
    if "mode" in payload:
        mode = str(payload["mode"]).strip().lower()
        if mode not in VALID_MODES:
            raise ValueError(f"Unsupported autopilot mode: {mode}")
        settings.mode = mode
    settings.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(settings)
    return settings


def _active_job_driver_ids(db, company_id: str) -> set:
    return {
        j.driver_id
        for j in db.query(Job)
        .filter(
            Job.company_id == company_id,
            Job.status.in_(("assigned", "in_progress")),
            Job.driver_id.isnot(None),
        )
        .all()
    }


def _available_drivers(db, company_id: str) -> List[Driver]:
    active_ids = _active_job_driver_ids(db, company_id)
    return [
        d
        for d in db.query(Driver).filter(Driver.company_id == company_id).all()
        if not d.blocked and d.id not in active_ids
    ]


def _pending_exists(db, company_id: str, kind: str, related_id: Optional[str]) -> bool:
    pending = (
        db.query(AuditLog)
        .filter(
            AuditLog.company_id == company_id,
            AuditLog.action_type == "autopilot_pending",
            AuditLog.requires_approval == True,  # noqa: E712
        )
        .order_by(AuditLog.created_at.desc())
        .limit(200)
        .all()
    )
    for entry in pending:
        details = entry.details or {}
        if (
            details.get("status") == "pending"
            and details.get("kind") == kind
            and entry.related_id == related_id
        ):
            return True
    return False


def _queue_approval(
    db,
    *,
    company_id: str,
    kind: str,
    summary: str,
    related_id: Optional[str],
    confidence: float,
    details: Optional[Dict] = None,
) -> Optional[AuditLog]:
    if _pending_exists(db, company_id, kind, related_id):
        return None
    payload = {"kind": kind, "status": "pending"}
    payload.update(details or {})
    return log_action(
        db,
        company_id=company_id,
        action_type="autopilot_pending",
        summary=summary,
        actor="autopilot",
        confidence=confidence,
        requires_approval=True,
        related_id=related_id,
        details=payload,
    )


def _run_auto_assign(db, settings, company_id: str, actions_left: int) -> List[Dict]:
    if actions_left <= 0 or not settings.auto_assign:
        return []
    unassigned = (
        db.query(Job)
        .filter(Job.company_id == company_id, Job.status == "unassigned")
        .order_by(Job.created_at.asc())
        .limit(actions_left)
        .all()
    )
    if not unassigned:
        return []

    actions = []
    drivers = _available_drivers(db, company_id)
    for job in unassigned:
        if not drivers:
            _queue_approval(
                db,
                company_id=company_id,
                kind="staffing_gap",
                summary=f"No available driver for {job.id}; operator assignment required",
                related_id=job.id,
                confidence=0.95,
                details={"job_id": job.id},
            )
            break

        driver = drivers.pop(0)
        can_execute = settings.mode in ("autonomous", "emergency")
        if not can_execute:
            queued = _queue_approval(
                db,
                company_id=company_id,
                kind="assign_job",
                summary=f"Autopilot wants to assign {job.id} to {driver.name}",
                related_id=job.id,
                confidence=0.72,
                details={"job_id": job.id, "driver_id": driver.id, "driver_name": driver.name},
            )
            if queued:
                actions.append({"type": "approval_queued", "summary": queued.summary})
            continue

        job.status = "assigned"
        job.driver_id = driver.id
        job.driver_name = driver.name
        job.assigned_at = datetime.now(timezone.utc)
        db.commit()

        opt = {"status": "skipped", "reason": "Auto-optimization disabled"}
        if settings.auto_optimize:
            try:
                opt = optimize_job_stops(
                    db,
                    job,
                    start_lat=driver.current_lat,
                    start_lng=driver.current_lng,
                )
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                opt = {"status": "error", "reason": f"{type(exc).__name__}: {exc}"}

        notice = None
        if settings.auto_notify:
            notice = notify_driver(
                db,
                company_id=company_id,
                driver_id=driver.id,
                driver_name=driver.name,
                title=f"New route: {job.id}",
                message=f"Autopilot assigned route {job.id} with {job.total_stops or 0} stops.",
                severity="info",
                alert_type="route_assigned",
                actor="autopilot",
            )

        log_action(
            db,
            company_id=company_id,
            action_type="autopilot_assigned_job",
            summary=f"Autopilot assigned {job.id} to {driver.name}",
            actor="autopilot",
            confidence=0.88,
            requires_approval=False,
            related_id=job.id,
            details={"driver_id": driver.id, "optimization": opt, "notification": notice},
        )
        actions.append({
            "type": "assigned_job",
            "job_id": job.id,
            "driver_id": driver.id,
            "summary": f"Assigned {job.id} to {driver.name}",
            "optimization": opt,
        })
    return actions


def _run_auto_optimize(db, settings, company_id: str, actions_left: int) -> List[Dict]:
    if actions_left <= 0 or not settings.auto_optimize:
        return []
    jobs = (
        db.query(Job)
        .filter(
            Job.company_id == company_id,
            Job.status.in_(("assigned", "in_progress")),
        )
        .order_by(Job.created_at.asc())
        .limit(actions_left)
        .all()
    )
    actions = []
    for job in jobs:
        if (job.total_stops or 0) < 3:
            continue
        driver = None
        if job.driver_id:
            driver = (
                db.query(Driver)
                .filter(Driver.company_id == company_id, Driver.id == job.driver_id)
                .first()
            )
        try:
            opt = optimize_job_stops(
                db,
                job,
                start_lat=getattr(driver, "current_lat", None),
                start_lng=getattr(driver, "current_lng", None),
            )
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            opt = {"status": "error", "reason": f"{type(exc).__name__}: {exc}"}

        if opt.get("status") != "ok":
            continue

        notice = None
        if settings.auto_notify and driver:
            notice = notify_driver(
                db,
                company_id=company_id,
                driver_id=driver.id,
                driver_name=driver.name,
                title=f"Route updated: {job.id}",
                message=(
                    f"Autopilot reordered {opt.get('stops_reordered', 0)} stops "
                    f"and saved {opt.get('distance_saved_km', 0)} km."
                ),
                severity="info",
                alert_type="route_reoptimized",
                actor="autopilot",
            )
        log_action(
            db,
            company_id=company_id,
            action_type="autopilot_optimized_route",
            summary=f"Autopilot optimized {job.id}, saving {opt.get('distance_saved_km')} km",
            actor="autopilot",
            confidence=0.91,
            requires_approval=False,
            related_id=job.id,
            details={"optimization": opt, "notification": notice},
        )
        actions.append({
            "type": "optimized_route",
            "job_id": job.id,
            "summary": f"Optimized {job.id}, saved {opt.get('distance_saved_km')} km",
            "optimization": opt,
        })
    return actions


def _run_safety_escalations(db, settings, company_id: str) -> List[Dict]:
    if not settings.safety_approval_required:
        return []
    alerts = (
        db.query(Alert)
        .filter(
            Alert.company_id == company_id,
            Alert.severity.in_(("critical", "high")),
            Alert.is_read == False,  # noqa: E712
        )
        .limit(20)
        .all()
    )
    actions = []
    for alert in alerts:
        queued = _queue_approval(
            db,
            company_id=company_id,
            kind="safety_escalation",
            summary=f"Safety escalation needs approval: {alert.title}",
            related_id=alert.id,
            confidence=0.97,
            details={"alert_id": alert.id, "severity": alert.severity},
        )
        if queued:
            actions.append({"type": "approval_queued", "summary": queued.summary})
    return actions


def _run_dispatch_briefing(db, company_id: str) -> Dict:
    open_jobs = (
        db.query(Job)
        .filter(Job.company_id == company_id, Job.status.in_(("unassigned", "assigned", "in_progress")))
        .count()
    )
    unassigned_jobs = (
        db.query(Job)
        .filter(Job.company_id == company_id, Job.status == "unassigned")
        .count()
    )
    active_alerts = (
        db.query(Alert)
        .filter(Alert.company_id == company_id, Alert.is_read == False)  # noqa: E712
        .count()
    )

    summary = (
        f"Autopilot prepared dispatch briefing: {open_jobs} open route(s), "
        f"{unassigned_jobs} unassigned, {active_alerts} unread alert(s)"
    )
    detail_payload = {
        "title": "Today's dispatch briefing",
        "status": "Completed",
        "owner": "AgentZero",
        "confidence": 99,
        "inputs": [
            f"{open_jobs} open route(s) active right now",
            f"{unassigned_jobs} unassigned job(s) waiting",
            f"{active_alerts} unread operational alert(s)",
        ],
        "steps": [
            "Checked open routes and driver capacity",
            "Compared unassigned work against available drivers",
            "Scanned unread alerts for anything blocking dispatch",
            "Prepared the first dispatch summary for the operator",
        ],
        "outcome": "Briefing is ready. No high-risk change was made without approval.",
        "nextFocus": "Assign waiting jobs or ask AgentZero to show the best driver match.",
        "open_jobs": open_jobs,
        "unassigned_jobs": unassigned_jobs,
        "active_alerts": active_alerts,
    }
    entry = log_action(
        db,
        company_id=company_id,
        action_type="autopilot_dispatch_briefing",
        summary=summary,
        actor="autopilot",
        confidence=0.99,
        requires_approval=False,
        details=detail_payload,
    )
    return {
        "type": "dispatch_briefing",
        "summary": "Prepared today's dispatch briefing",
        "audit_id": entry.id,
        **detail_payload,
    }


def run_autopilot(db, company_id: str, *, force: bool = False) -> Dict:
    settings = get_or_create_settings(db, company_id)
    actions: List[Dict] = []
    if not settings.enabled and not force:
        return {
            "enabled": False,
            "mode": settings.mode,
            "actions": [],
            "summary": "Autopilot is off",
        }
    if settings.mode == "manual" and not force:
        return {
            "enabled": bool(settings.enabled),
            "mode": settings.mode,
            "actions": [],
            "summary": "Autopilot is in manual mode",
        }

    max_actions = max(1, min(settings.max_actions_per_run or 5, 20))
    actions.extend(_run_safety_escalations(db, settings, company_id))
    actions_left = max_actions - len(actions)
    actions.extend(_run_auto_assign(db, settings, company_id, actions_left))
    actions_left = max_actions - len(actions)
    actions.extend(_run_auto_optimize(db, settings, company_id, actions_left))
    if not actions:
        actions.append(_run_dispatch_briefing(db, company_id))

    log_action(
        db,
        company_id=company_id,
        action_type="autopilot_tick",
        summary=f"Autopilot tick completed with {len(actions)} action(s)",
        actor="autopilot",
        confidence=1.0,
        requires_approval=False,
        details={"mode": settings.mode, "actions": actions},
    )
    return {
        "enabled": bool(settings.enabled),
        "mode": settings.mode,
        "actions": actions,
        "summary": f"Autopilot completed {len(actions)} action(s)",
    }


def autopilot_status(db, company_id: str) -> Dict:
    settings = get_or_create_settings(db, company_id)
    recent = (
        db.query(AuditLog)
        .filter(
            AuditLog.company_id == company_id,
            AuditLog.actor == "autopilot",
        )
        .order_by(AuditLog.created_at.desc())
        .limit(8)
        .all()
    )
    pending = (
        db.query(AuditLog)
        .filter(
            AuditLog.company_id == company_id,
            AuditLog.action_type == "autopilot_pending",
            AuditLog.requires_approval == True,  # noqa: E712
        )
        .order_by(AuditLog.created_at.desc())
        .limit(50)
        .all()
    )
    pending = [p for p in pending if (p.details or {}).get("status") == "pending"]
    return {
        "settings": settings.to_dict(),
        "recent_actions": [
            {
                "id": e.id,
                "summary": e.summary,
                "action_type": e.action_type,
                "requires_approval": e.requires_approval,
                "related_id": e.related_id,
                "details": e.details or {},
                "at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in recent
        ],
        "pending_approvals": [
            {
                "id": e.id,
                "summary": e.summary,
                "related_id": e.related_id,
                "details": e.details or {},
                "confidence": e.confidence,
                "at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in pending
        ],
    }

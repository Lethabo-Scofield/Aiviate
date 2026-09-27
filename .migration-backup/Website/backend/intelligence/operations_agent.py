"""Aiviate Operations Agent.

This module coordinates existing deterministic capabilities. It does not own
routing math, driver security, or customer communications; it calls the current
dispatch primitives and records every step in the operational audit trail.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import func

from intelligence.audit_logger import log_action
from intelligence.driver_notifier import notify_driver
from models import Alert, AutopilotSettings, Driver, Job, Stop
from routes.optimization import _create_jobs_from_clusters
from utils import cluster_stops, record_domain_event


STORE_ORDER_PREFIX = "STORE-%"


def _now():
    return datetime.now(timezone.utc)


def _store_stop_query(db, company_id):
    return db.query(Stop).filter(
        Stop.company_id == company_id,
        Stop.order_id.like(STORE_ORDER_PREFIX),
    )


def _store_job_query(db, company_id):
    return (
        db.query(Job)
        .join(Stop, Stop.job_id == Job.id)
        .filter(Job.company_id == company_id, Stop.order_id.like(STORE_ORDER_PREFIX))
        .distinct()
    )


def _event(db, company_id, *, action_type, summary, related_id=None, details=None,
           actor="aiviate_operations_agent", confidence=0.96, requires_approval=False):
    return log_action(
        db,
        company_id=company_id,
        action_type=action_type,
        summary=summary,
        actor=actor,
        confidence=confidence,
        requires_approval=requires_approval,
        related_id=related_id,
        details=details or {},
    )


def _safe_domain_event(db, table_name, company_id, **kwargs):
    try:
        record_domain_event(db, table_name, company_id, **kwargs)
    except Exception:
        # Some deployments have not run the expanded schema yet. AuditLog remains
        # the source for the UI, so do not fail the operational workflow.
        db.rollback()


def get_operation_snapshot(db, company_id):
    stops = _store_stop_query(db, company_id).all()
    jobs = _store_job_query(db, company_id).all()
    drivers = db.query(Driver).filter(Driver.company_id == company_id).all()
    settings = db.query(AutopilotSettings).filter(AutopilotSettings.company_id == company_id).first()

    pending = [s for s in stops if not s.job_id and not s.completed]
    active_jobs = [j for j in jobs if j.status in ("assigned", "in_progress")]
    delivered = [s for s in stops if s.completed]
    failed = [
        s for s in stops
        if (s.notes or "").lower().find("failed") >= 0 or (s.notes or "").lower().find("review") >= 0
    ]
    available_drivers = [d for d in drivers if d.status == "available" and not d.blocked]

    pending_approvals = (
        db.query(func.count())
        .select_from(Alert)
        .filter(Alert.company_id == company_id, Alert.type == "approval", Alert.is_read.is_(False))
        .scalar()
    ) or 0
    unresolved_exceptions = (
        db.query(func.count())
        .select_from(Alert)
        .filter(
            Alert.company_id == company_id,
            Alert.severity.in_(["warning", "critical"]),
            Alert.is_read.is_(False),
        )
        .scalar()
    ) or 0

    recent_actions = (
        db.query(_audit_model())
        .filter_by(company_id=company_id)
        .order_by(_audit_model().created_at.desc())
        .limit(25)
        .all()
    )
    counters = {
        "orders_processed": 0,
        "routes_created": 0,
        "drivers_assigned": 0,
        "customers_contacted": 0,
        "exceptions_resolved": 0,
        "calls_completed": 0,
    }
    for entry in recent_actions:
        action = entry.action_type or ""
        if "order" in action:
            counters["orders_processed"] += 1
        if "route" in action or "plan" in action:
            counters["routes_created"] += 1
        if "driver" in action and "assign" in action:
            counters["drivers_assigned"] += 1
        if "customer" in action or "notification" in action:
            counters["customers_contacted"] += 1
        if "exception" in action and "resolved" in action:
            counters["exceptions_resolved"] += 1
        if "call" in action and "completed" in action:
            counters["calls_completed"] += 1

    on_time_projection = 98 if unresolved_exceptions == 0 else max(72, 98 - unresolved_exceptions * 4)
    status = "needs_attention" if unresolved_exceptions or pending_approvals else "healthy"

    return {
        "status": status,
        "headline": "Aiviate is running today's operation",
        "operational_status": {
            "total_deliveries": len(stops),
            "pending": len(pending),
            "active": sum(1 for s in stops if s.job_id and not s.completed),
            "delivered": len(delivered),
            "failed": len(failed),
            "routes_active": len(active_jobs),
            "drivers_active": len({j.driver_id for j in active_jobs if j.driver_id}),
            "drivers_available": len(available_drivers),
            "projected_on_time_pct": on_time_projection,
            "unresolved_exceptions": unresolved_exceptions,
            "pending_approvals": pending_approvals,
        },
        "activity": counters,
        "autonomy": {
            "enabled": bool(settings.enabled) if settings else False,
            "mode": settings.mode if settings else "assist",
            "auto_assign": bool(settings.auto_assign) if settings else True,
            "auto_optimize": bool(settings.auto_optimize) if settings else True,
            "auto_notify": bool(settings.auto_notify) if settings else True,
        },
        "recent_activity": [entry.to_dict() for entry in recent_actions[:10]],
    }


def _audit_model():
    from models import AuditLog
    return AuditLog


def run_new_order_workflow(db, company_id):
    """Run the first autonomous workflow: New Order -> Plan -> Assign -> Notify."""
    correlation_id = f"op-{uuid.uuid4().hex[:12]}"
    started_at = _now().isoformat()
    steps = []

    pending_stops = _store_stop_query(db, company_id).filter(
        Stop.completed.is_(False),
        Stop.job_id.is_(None),
        Stop.lat.isnot(None),
        Stop.lng.isnot(None),
    ).order_by(Stop.created_at.asc()).all()

    _event(
        db,
        company_id,
        action_type="workflow_sensed_orders",
        summary=f"Aiviate found {len(pending_stops)} storefront order(s) ready for planning.",
        details={"correlation_id": correlation_id, "order_ids": [s.order_id for s in pending_stops]},
    )
    steps.append({"stage": "Sense", "result": f"{len(pending_stops)} order(s) ready"})

    if not pending_stops:
        return {
            "success": True,
            "correlation_id": correlation_id,
            "summary": "No new storefront orders need planning.",
            "steps": steps,
            "started_at": started_at,
        }

    for stop in pending_stops:
        _event(
            db,
            company_id,
            action_type="order_validated",
            summary=f"Address ready for {stop.order_id}.",
            related_id=stop.id,
            details={"correlation_id": correlation_id, "address": stop.address},
        )
        _safe_domain_event(
            db,
            "order_status_history",
            company_id,
            status="ready_for_planning",
            external_ref=stop.order_id,
            correlation_id=correlation_id,
            source="operations_agent",
            payload={"stop_id": stop.id, "status": "ready_for_planning"},
        )
    steps.append({"stage": "Understand", "result": "Validated storefront order data"})

    clusters = cluster_stops([s.to_dict() for s in pending_stops], radius_km=8)
    jobs = _create_jobs_from_clusters(db, clusters, company_id)
    db.commit()

    _event(
        db,
        company_id,
        action_type="dispatch_plan_created",
        summary=f"Aiviate created {len(jobs)} route job(s) from {len(pending_stops)} order(s).",
        details={
            "correlation_id": correlation_id,
            "job_ids": [j.id for j in jobs],
            "stop_ids": [s.id for s in pending_stops],
        },
    )
    steps.append({"stage": "Decide", "result": f"{len(jobs)} route job(s) created"})

    drivers = db.query(Driver).filter(
        Driver.company_id == company_id,
        Driver.blocked.is_(False),
        Driver.status.in_(["available", "active"]),
    ).order_by(Driver.name.asc()).all()

    assignments = []
    for job in jobs:
        driver = _select_driver(drivers, assignments)
        if not driver:
            _event(
                db,
                company_id,
                action_type="approval_required_capacity_shortage",
                summary=f"{job.id} needs a driver before dispatch.",
                related_id=job.id,
                requires_approval=True,
                confidence=0.82,
                details={"correlation_id": correlation_id, "reason": "no_available_driver"},
            )
            _add_attention_alert(db, company_id, "Capacity approval needed", f"{job.id} has no available driver.")
            continue

        job.status = "assigned"
        job.driver_id = driver.id
        job.driver_name = driver.name
        job.assigned_at = _now()
        assignments.append({"job_id": job.id, "driver_id": driver.id, "driver_name": driver.name})
        db.commit()

        _event(
            db,
            company_id,
            action_type="driver_assigned",
            summary=f"Aiviate assigned {job.id} to {driver.name}.",
            related_id=job.id,
            details={
                "correlation_id": correlation_id,
                "driver_id": driver.id,
                "driver_name": driver.name,
                "reason": "available_driver_lowest_current_assignment_count",
            },
        )

        notify_driver(
            db,
            company_id=company_id,
            driver_id=driver.id,
            driver_name=driver.name,
            title="New delivery route assigned",
            message=f"{job.id} is ready with {job.total_stops} storefront stop(s).",
            severity="info",
            alert_type="route_assigned",
            actor="aiviate_operations_agent",
        )

    steps.append({"stage": "Act", "result": f"{len(assignments)} driver assignment(s) made"})

    for stop in pending_stops:
        _event(
            db,
            company_id,
            action_type="customer_notification_simulated",
            summary=f"Customer notification queued in simulation for {stop.order_id}.",
            related_id=stop.id,
            details={
                "correlation_id": correlation_id,
                "channel": "simulation",
                "reason": "no_customer_sms_or_email_provider_configured",
            },
        )
    steps.append({"stage": "Notify", "result": "Driver alerts written; customer messages simulated"})

    return {
        "success": True,
        "correlation_id": correlation_id,
        "summary": f"Aiviate planned {len(pending_stops)} order(s), created {len(jobs)} route(s), and assigned {len(assignments)} driver(s).",
        "steps": steps,
        "jobs": [j.to_dict() for j in jobs],
        "assignments": assignments,
        "started_at": started_at,
    }


def _select_driver(drivers, assignments):
    if not drivers:
        return None
    assigned_counts = {}
    for row in assignments:
        assigned_counts[row["driver_id"]] = assigned_counts.get(row["driver_id"], 0) + 1
    return sorted(drivers, key=lambda d: (assigned_counts.get(d.id, 0), d.name or ""))[0]


def _add_attention_alert(db, company_id, title, message):
    db.add(Alert(
        id=str(uuid.uuid4()),
        type="approval",
        severity="warning",
        title=title,
        message=message,
        company_id=company_id,
    ))
    db.commit()


def list_exceptions(db, company_id, limit=50):
    alerts = db.query(Alert).filter(
        Alert.company_id == company_id,
        Alert.severity.in_(["warning", "critical"]),
    ).order_by(Alert.created_at.desc()).limit(limit).all()
    return [a.to_dict() for a in alerts]


def list_approvals(db, company_id, limit=50):
    approvals = db.query(Alert).filter(
        Alert.company_id == company_id,
        Alert.type == "approval",
    ).order_by(Alert.created_at.desc()).limit(limit).all()
    audit = db.query(_audit_model()).filter(
        _audit_model().company_id == company_id,
        _audit_model().requires_approval.is_(True),
    ).order_by(_audit_model().created_at.desc()).limit(limit).all()
    return {
        "alerts": [a.to_dict() for a in approvals],
        "requests": [a.to_dict() for a in audit],
    }

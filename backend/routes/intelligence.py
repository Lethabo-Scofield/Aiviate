"""Intelligence-layer HTTP surface.

Endpoints:
  GET  /api/intelligence/recommendations
  POST /api/intelligence/recommendations/<rec_id>/acknowledge
  GET  /api/intelligence/audit-log
"""
from datetime import datetime, timezone

from flask import jsonify, g, request
from sqlalchemy import desc

from routes import intelligence_bp
from middleware import require_auth, require_admin
from models import Driver, Device, SafetyEvent, Alert, AuditLog
from utils import get_db_session
from intelligence.anomaly_detector import (
    detect_device_anomalies,
    detect_fatigue_clusters,
    detect_blocked_drivers,
)
from intelligence.recommendation_engine import build_recommendations
from intelligence.audit_logger import log_action
from intelligence.workflow_engine import run_autonomous_workflows


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

        recs = build_recommendations(
            device_anomalies=device_anomalies,
            fatigue_clusters=fatigue_clusters,
            blocked_drivers=blocked,
            open_critical_alerts=crit_alerts,
        )

        return jsonify({
            "recommendations": recs,
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

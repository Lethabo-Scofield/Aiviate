import traceback

from flask import jsonify, g, request

from intelligence.operations_agent import (
    get_operation_snapshot,
    list_approvals,
    list_exceptions,
    run_new_order_workflow,
)
from middleware import require_admin, require_auth
from models import AutopilotSettings, AuditLog, utcnow
from routes import operations_bp
from utils import get_db_session


@operations_bp.route("/api/operations/snapshot", methods=["GET"])
@require_auth
@require_admin
def operations_snapshot():
    db = get_db_session()
    try:
        return jsonify(get_operation_snapshot(db, g.company_id))
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Failed to load operations snapshot"}), 500
    finally:
        db.close()


@operations_bp.route("/api/operations/run-new-order-workflow", methods=["POST"])
@require_auth
@require_admin
def run_operations_workflow():
    db = get_db_session()
    try:
        return jsonify(run_new_order_workflow(db, g.company_id))
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to run autonomous order workflow"}), 500
    finally:
        db.close()


@operations_bp.route("/api/activity", methods=["GET"])
@require_auth
@require_admin
def activity():
    limit = min(int(request.args.get("limit", 100)), 250)
    db = get_db_session()
    try:
        rows = (
            db.query(AuditLog)
            .filter(AuditLog.company_id == g.company_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .all()
        )
        return jsonify({"entries": [row.to_dict() for row in rows]})
    finally:
        db.close()


@operations_bp.route("/api/exceptions", methods=["GET"])
@require_auth
@require_admin
def exceptions():
    db = get_db_session()
    try:
        return jsonify({"exceptions": list_exceptions(db, g.company_id)})
    finally:
        db.close()


@operations_bp.route("/api/approvals", methods=["GET"])
@require_auth
@require_admin
def approvals():
    db = get_db_session()
    try:
        return jsonify(list_approvals(db, g.company_id))
    finally:
        db.close()


@operations_bp.route("/api/policies", methods=["GET"])
@require_auth
@require_admin
def get_policies():
    db = get_db_session()
    try:
        settings = db.query(AutopilotSettings).filter(AutopilotSettings.company_id == g.company_id).first()
        if not settings:
            settings = AutopilotSettings(company_id=g.company_id, enabled=True, mode="autonomous")
            db.add(settings)
            db.commit()
        return jsonify({"policies": _policy_response(settings)})
    finally:
        db.close()


@operations_bp.route("/api/policies", methods=["PATCH"])
@require_auth
@require_admin
def update_policies():
    data = request.get_json(silent=True) or {}
    allowed_modes = {"manual", "assist", "autonomous", "emergency"}
    db = get_db_session()
    try:
        settings = db.query(AutopilotSettings).filter(AutopilotSettings.company_id == g.company_id).first()
        if not settings:
            settings = AutopilotSettings(company_id=g.company_id)
            db.add(settings)
        for field in ("enabled", "auto_assign", "auto_optimize", "auto_notify", "safety_approval_required"):
            if field in data:
                setattr(settings, field, bool(data[field]))
        if data.get("mode") in allowed_modes:
            settings.mode = data["mode"]
        if "max_actions_per_run" in data:
            settings.max_actions_per_run = max(1, min(int(data["max_actions_per_run"]), 50))
        settings.updated_at = utcnow()
        db.commit()
        return jsonify({"policies": _policy_response(settings)})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to update policies"}), 500
    finally:
        db.close()


def _policy_response(settings):
    return {
        "autonomy_level": _mode_to_level(settings.mode),
        "enabled": bool(settings.enabled),
        "auto_assign": bool(settings.auto_assign),
        "auto_optimize": bool(settings.auto_optimize),
        "auto_notify": bool(settings.auto_notify),
        "safety_approval_required": bool(settings.safety_approval_required),
        "mode": settings.mode,
        "driver_assignment": "automatic" if settings.auto_assign else "approval_required",
        "route_changes": "automatic" if settings.auto_optimize else "approval_required",
        "customer_eta_notifications": "simulation" if settings.auto_notify else "manual",
        "safety_escalations": "approval_required" if settings.safety_approval_required else "automatic",
        "max_actions_per_run": settings.max_actions_per_run,
        "guardrails": [
            "Only APP backend changes operational state.",
            "Only STORE-* storefront orders are included in autonomous planning.",
            "Customer notifications are simulated until a real provider is configured.",
            "Safety incidents still require policy approval before outbound escalation.",
        ],
    }


def _mode_to_level(mode):
    return {
        "manual": 0,
        "assist": 2,
        "autonomous": 3,
        "emergency": 4,
    }.get(mode, 1)

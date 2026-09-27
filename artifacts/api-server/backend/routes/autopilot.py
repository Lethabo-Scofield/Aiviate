"""Autopilot HTTP surface."""
from flask import g, jsonify, request

from intelligence.autopilot import (
    autopilot_status,
    run_autopilot,
    update_settings,
)
from middleware import require_admin, require_auth
from routes import autopilot_bp
from utils import get_db_session


@autopilot_bp.route("/api/autopilot/status", methods=["GET"])
@require_auth
@require_admin
def get_autopilot_status():
    db = get_db_session()
    try:
        return jsonify(autopilot_status(db, g.company_id))
    finally:
        db.close()


@autopilot_bp.route("/api/autopilot/settings", methods=["PATCH"])
@require_auth
@require_admin
def patch_autopilot_settings():
    db = get_db_session()
    try:
        payload = request.get_json(silent=True) or {}
        settings = update_settings(db, g.company_id, payload)
        return jsonify({"settings": settings.to_dict()})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    finally:
        db.close()


@autopilot_bp.route("/api/autopilot/run", methods=["POST"])
@require_auth
@require_admin
def run_autopilot_once():
    db = get_db_session()
    try:
        payload = request.get_json(silent=True) or {}
        return jsonify(run_autopilot(db, g.company_id, force=bool(payload.get("force"))))
    finally:
        db.close()

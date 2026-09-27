import uuid
import traceback

from flask import request, jsonify, g

from routes import alerts_bp
from middleware import require_auth, require_admin
from models import Alert
from utils import get_db_session


@alerts_bp.route("/api/alerts", methods=["GET"])
@require_auth
@require_admin
def list_alerts():
    db = get_db_session()
    try:
        filter_unread = request.args.get("unread") == "true"
        limit = int(request.args.get("limit", 100))
        q = db.query(Alert).filter(Alert.company_id == g.company_id)
        if filter_unread:
            q = q.filter(Alert.is_read == False)
        alerts = q.order_by(Alert.created_at.desc()).limit(limit).all()
        return jsonify({
            "alerts": [a.to_dict() for a in alerts],
            "unread_count": db.query(Alert).filter(
                Alert.company_id == g.company_id,
                Alert.is_read == False,
            ).count(),
        })
    finally:
        db.close()


@alerts_bp.route("/api/alerts/<alert_id>/read", methods=["POST"])
@require_auth
@require_admin
def mark_alert_read(alert_id):
    db = get_db_session()
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id, Alert.company_id == g.company_id).first()
        if not alert:
            return jsonify({"error": "Alert not found"}), 404
        alert.is_read = True
        db.commit()
        return jsonify({"success": True, "alert": alert.to_dict()})
    except Exception:
        db.rollback()
        return jsonify({"error": "Failed to mark alert read"}), 500
    finally:
        db.close()


@alerts_bp.route("/api/alerts/read-all", methods=["POST"])
@require_auth
@require_admin
def mark_all_read():
    db = get_db_session()
    try:
        db.query(Alert).filter(
            Alert.company_id == g.company_id,
            Alert.is_read == False,
        ).update({"is_read": True})
        db.commit()
        return jsonify({"success": True})
    except Exception:
        db.rollback()
        return jsonify({"error": "Failed to mark all read"}), 500
    finally:
        db.close()


@alerts_bp.route("/api/alerts/<alert_id>", methods=["DELETE"])
@require_auth
@require_admin
def delete_alert(alert_id):
    db = get_db_session()
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id, Alert.company_id == g.company_id).first()
        if not alert:
            return jsonify({"error": "Alert not found"}), 404
        db.delete(alert)
        db.commit()
        return jsonify({"success": True})
    except Exception:
        db.rollback()
        return jsonify({"error": "Failed to delete alert"}), 500
    finally:
        db.close()

import hmac
import os
import traceback
import uuid
from datetime import datetime, timezone

from flask import request, jsonify

from models import Stop, Job, AuditLog
from routes import support_bp
from utils import get_db_session


def _service_authorized():
    expected = os.environ.get("AIVIATE_SERVICE_TOKEN", "").strip()
    provided = (
        request.headers.get("X-Aiviate-Service-Token")
        or request.headers.get("Authorization", "").replace("Bearer ", "", 1)
    ).strip()
    return bool(expected and provided and hmac.compare_digest(expected, provided))


def _require_service():
    if not _service_authorized():
        return jsonify({"error": "Service authentication required"}), 401
    return None


def _correlation_id():
    return request.headers.get("X-Correlation-ID") or f"corr-{uuid.uuid4().hex}"


def _find_stop(db, tenant_id, order_reference):
    candidates = [order_reference]
    if not order_reference.startswith("MERCH-"):
        candidates.append(f"MERCH-{order_reference}")
    if not order_reference.startswith("STORE-"):
        candidates.append(f"STORE-{order_reference}")
    return db.query(Stop).filter(
        Stop.company_id == tenant_id,
        Stop.order_id.in_(candidates),
    ).first()


def _verified_stop(db, data):
    tenant_id = (data.get("tenant_id") or "").strip()
    order_reference = (data.get("order_reference") or data.get("external_order_id") or "").strip()
    phone = (data.get("phone") or "").strip()
    if not tenant_id or not order_reference or not phone:
        return None, {"verified": False, "reason": "tenant_id, order_reference and phone are required"}
    stop = _find_stop(db, tenant_id, order_reference)
    if not stop:
        return None, {"verified": False, "reason": "order not found"}
    if not stop.phone or stop.phone[-4:] != phone[-4:]:
        return None, {"verified": False, "reason": "phone verification failed"}
    return stop, {"verified": True}


def _safe_status(stop):
    job = stop.job
    return {
        "order_reference": stop.order_id,
        "customer_name": stop.customer_name,
        "delivery_status": "delivered" if stop.completed else (job.status if job else "accepted"),
        "delivery_window_start": stop.time_window_start,
        "delivery_window_end": stop.time_window_end,
        "driver_name": job.driver_name if job and job.status in ("assigned", "in_progress", "completed") else None,
        "stop_number": stop.stop_number,
        "completed_at": stop.completed_at.isoformat() if stop.completed_at else None,
    }


@support_bp.route("/api/customer-support/verify", methods=["POST"])
def verify_customer():
    error = _require_service()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    db = get_db_session()
    try:
        stop, result = _verified_stop(db, data)
        payload = {"correlation_id": _correlation_id(), **result}
        if stop:
            payload["order"] = _safe_status(stop)
        return jsonify(payload), 200 if result["verified"] else 404
    finally:
        db.close()


@support_bp.route("/api/customer-support/order-status", methods=["POST"])
def order_status():
    error = _require_service()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    db = get_db_session()
    try:
        stop, result = _verified_stop(db, data)
        if not stop:
            return jsonify({"correlation_id": _correlation_id(), **result}), 403
        return jsonify({
            "success": True,
            "correlation_id": _correlation_id(),
            "order": _safe_status(stop),
        })
    finally:
        db.close()


@support_bp.route("/api/customer-support/request-reschedule", methods=["POST"])
def request_reschedule():
    error = _require_service()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    requested_window = data.get("requested_window") or {}
    if not requested_window.get("start") or not requested_window.get("end"):
        return jsonify({"error": "requested_window.start and requested_window.end are required"}), 400

    db = get_db_session()
    try:
        stop, result = _verified_stop(db, data)
        if not stop:
            return jsonify({"correlation_id": _correlation_id(), **result}), 403
        stop.time_window_start = requested_window["start"]
        stop.time_window_end = requested_window["end"]
        db.add(AuditLog(
            id=f"AUD-{uuid.uuid4().hex[:12].upper()}",
            company_id=stop.company_id,
            action_type="customer_reschedule_requested",
            summary=f"Customer requested reschedule for {stop.order_id}",
            actor="call_agent",
            related_id=stop.id,
            details={"requested_window": requested_window, "correlation_id": _correlation_id()},
        ))
        db.commit()
        return jsonify({"success": True, "correlation_id": _correlation_id(), "order": _safe_status(stop)})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to request reschedule", "correlation_id": _correlation_id()}), 500
    finally:
        db.close()


@support_bp.route("/api/customer-support/confirm-availability", methods=["POST"])
def confirm_availability():
    error = _require_service()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    available = bool(data.get("available"))
    db = get_db_session()
    try:
        stop, result = _verified_stop(db, data)
        if not stop:
            return jsonify({"correlation_id": _correlation_id(), **result}), 403
        db.add(AuditLog(
            id=f"AUD-{uuid.uuid4().hex[:12].upper()}",
            company_id=stop.company_id,
            action_type="customer_availability_confirmed",
            summary=f"Customer availability {'confirmed' if available else 'declined'} for {stop.order_id}",
            actor="call_agent",
            related_id=stop.id,
            details={"available": available, "correlation_id": _correlation_id()},
        ))
        db.commit()
        return jsonify({"success": True, "correlation_id": _correlation_id(), "available": available})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to confirm availability", "correlation_id": _correlation_id()}), 500
    finally:
        db.close()


@support_bp.route("/api/customer-support/human-handoff", methods=["POST"])
def human_handoff():
    error = _require_service()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    db = get_db_session()
    try:
        stop, result = _verified_stop(db, data)
        if not stop:
            return jsonify({"correlation_id": _correlation_id(), **result}), 403
        handoff_id = f"HANDOFF-{uuid.uuid4().hex[:10].upper()}"
        db.add(AuditLog(
            id=f"AUD-{uuid.uuid4().hex[:12].upper()}",
            company_id=stop.company_id,
            action_type="human_support_handoff_requested",
            summary=f"Human support handoff requested for {stop.order_id}",
            actor="call_agent",
            related_id=stop.id,
            details={
                "handoff_id": handoff_id,
                "reason": data.get("reason"),
                "correlation_id": _correlation_id(),
            },
        ))
        db.commit()
        return jsonify({"success": True, "correlation_id": _correlation_id(), "handoff_id": handoff_id})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to request handoff", "correlation_id": _correlation_id()}), 500
    finally:
        db.close()

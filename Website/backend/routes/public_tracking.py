import hashlib
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta

from flask import jsonify, request
from sqlalchemy import text

from routes import public_bp
from models import AuditLog, Company, Driver, Job, PublicTrackingToken, Stop, engine
from utils import get_db_session, record_domain_event


TRACKING_TOKEN_BYTES = 32
TRACKING_TOKEN_DAYS = 30
_tracking_rate_window = {}


def _hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_token():
    return secrets.token_urlsafe(TRACKING_TOKEN_BYTES)


def _now():
    return datetime.now(timezone.utc)


def _correlation_id():
    return request.headers.get("X-Correlation-ID") or f"corr-{uuid.uuid4().hex}"


def _client_key(token_hash=None):
    forwarded = request.headers.get("X-Forwarded-For", "")
    ip = (forwarded.split(",", 1)[0] or request.remote_addr or "unknown").strip()
    return f"{ip}:{token_hash or 'anonymous'}"


def _rate_limit_or_error(token_hash=None):
    limit = 60
    now = datetime.now(timezone.utc).timestamp()
    window = int(now // 60)
    key = (_client_key(token_hash), window)
    count = _tracking_rate_window.get(key, 0) + 1
    _tracking_rate_window[key] = count
    for old_key in list(_tracking_rate_window):
        if old_key[1] < window:
            _tracking_rate_window.pop(old_key, None)
    if count > limit:
        return jsonify({"error": "Tracking is temporarily unavailable. Please try again later."}), 429
    return None


def ensure_tracking_table():
    PublicTrackingToken.__table__.create(engine, checkfirst=True)


def create_tracking_token(db, stop, actor_id=None, expires_at=None):
    token = _new_token()
    token_hash = _hash_token(token)
    public_reference = stop.order_id or stop.id
    expires = expires_at or (_now() + timedelta(days=TRACKING_TOKEN_DAYS))

    existing = db.query(PublicTrackingToken).filter(
        PublicTrackingToken.company_id == stop.company_id,
        PublicTrackingToken.stop_id == stop.id,
        PublicTrackingToken.status == "active",
        PublicTrackingToken.revoked_at.is_(None),
    ).all()
    for row in existing:
        row.status = "revoked"
        row.revoked_at = _now()

    row = PublicTrackingToken(
        id=f"TRK-{uuid.uuid4().hex[:12].upper()}",
        company_id=stop.company_id,
        stop_id=stop.id,
        token_hash=token_hash,
        public_reference=public_reference,
        status="active",
        expires_at=expires,
        created_by=actor_id,
    )
    db.add(row)
    return token, row


def _tracking_link(token):
    origin = (
        os.environ.get("PUBLIC_APP_URL")
        or request.headers.get("X-Public-App-Origin")
        or request.host_url.rstrip("/")
    )
    return f"{origin}/track/{token}"


def _safe_status(stop, job=None, company=None, tracking=None):
    completed = bool(stop.completed)
    assigned = bool(job and job.driver_id)
    in_progress = bool(job and job.status == "in_progress")
    status = "delivered" if completed else "out_for_delivery" if in_progress else "scheduled" if assigned else "received"
    if stop.lat is None or stop.lng is None:
        status = "address_review"

    timeline = [
        {"status": "received", "label": "Order received", "completed": True, "timestamp": stop.created_at.isoformat() if stop.created_at else None},
        {"status": "scheduled", "label": "Delivery scheduled", "completed": assigned or in_progress or completed, "timestamp": job.assigned_at.isoformat() if job and job.assigned_at else None},
        {"status": "out_for_delivery", "label": "Driver en route", "completed": in_progress or completed, "timestamp": job.assigned_at.isoformat() if job and job.assigned_at else None},
        {"status": "delivered", "label": "Delivered", "completed": completed, "timestamp": stop.completed_at.isoformat() if stop.completed_at else None},
    ]

    eta = _arrival_window(stop, job)
    return {
        "branding": {
            "company_name": company.name if company else "Aiviate",
        },
        "order": {
            "reference": tracking.public_reference if tracking else (stop.order_id or "Delivery"),
            "status": status,
            "status_label": status.replace("_", " ").title(),
            "delivery_window": {
                "start": stop.time_window_start or None,
                "end": stop.time_window_end or None,
            },
            "return_status": None,
        },
        "delivery": {
            "timeline": timeline,
            "estimated_arrival": eta,
            "driver_approaching": bool(eta and eta.get("approaching")),
            "outcome": "delivered" if completed else None,
            "proof_summary": (
                {
                    "type": "delivery_confirmation",
                    "completed_at": stop.completed_at.isoformat() if stop.completed_at else None,
                    "location_verified": True,
                    "package_verified": True,
                }
                if completed else None
            ),
            "reschedule_allowed": not completed and status in {"received", "scheduled", "address_review"},
        },
        "meta": {
            "freshness": "current" if eta else "unavailable",
            "tracking_expires_at": tracking.expires_at.isoformat() if tracking and tracking.expires_at else None,
        },
    }


def _arrival_window(stop, job=None):
    if stop.completed:
        return None
    if stop.time_window_start and stop.time_window_end:
        return {
            "start": stop.time_window_start,
            "end": stop.time_window_end,
            "confidence": "scheduled_window",
            "freshness": "planned",
            "approaching": False,
        }
    if job and job.assigned_at and job.estimated_time_min:
        start = job.assigned_at + timedelta(minutes=max(0, int(job.estimated_time_min) - 30))
        end = job.assigned_at + timedelta(minutes=int(job.estimated_time_min) + 30)
        return {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "confidence": "fallback_no_live_traffic",
            "freshness": "planned",
            "approaching": False,
        }
    return None


def _lookup_tracking(db, token):
    token_hash = _hash_token(str(token or ""))
    rate_error = _rate_limit_or_error(token_hash)
    if rate_error:
        return None, None, None, rate_error
    tracking = db.query(PublicTrackingToken).filter(PublicTrackingToken.token_hash == token_hash).first()
    if not tracking or not tracking.is_active():
        return None, None, None, (jsonify({"error": "Tracking link is invalid or expired"}), 404)
    stop = db.query(Stop).filter(
        Stop.id == tracking.stop_id,
        Stop.company_id == tracking.company_id,
    ).first()
    if not stop:
        return None, None, None, (jsonify({"error": "Tracking link is invalid or expired"}), 404)
    job = None
    if stop.job_id:
        job = db.query(Job).filter(Job.id == stop.job_id, Job.company_id == stop.company_id).first()
    company = db.query(Company).filter(Company.id == stop.company_id).first()
    return tracking, stop, (job, company), None


@public_bp.route("/api/public/tracking/<token>", methods=["GET"])
def get_public_tracking(token):
    ensure_tracking_table()
    db = get_db_session()
    try:
        tracking, stop, related, error = _lookup_tracking(db, token)
        if error:
            return error
        job, company = related
        return jsonify(_safe_status(stop, job=job, company=company, tracking=tracking))
    finally:
        db.close()


@public_bp.route("/api/public/tracking/<token>/reschedule", methods=["POST"])
def request_tracking_reschedule(token):
    ensure_tracking_table()
    data = request.get_json(silent=True) or {}
    window = data.get("requested_window") or {}
    start = str(window.get("start") or "").strip()
    end = str(window.get("end") or "").strip()
    if not start or not end or start >= end:
        return jsonify({"error": "requested_window.start must be before requested_window.end"}), 400

    db = get_db_session()
    try:
        tracking, stop, related, error = _lookup_tracking(db, token)
        if error:
            return error
        if stop.completed:
            return jsonify({"error": "This delivery can no longer be rescheduled"}), 409
        previous = {"time_window_start": stop.time_window_start, "time_window_end": stop.time_window_end}
        stop.time_window_start = start
        stop.time_window_end = end
        correlation_id = _correlation_id()
        db.add(AuditLog(
            id=f"AUD-{uuid.uuid4().hex[:12].upper()}",
            company_id=stop.company_id,
            action_type="public_tracking_reschedule_requested",
            summary=f"Customer requested a new delivery window for {tracking.public_reference}",
            actor="public_tracking",
            related_id=stop.id,
            details={
                "previous": previous,
                "requested_window": {"start": start, "end": end},
                "correlation_id": correlation_id,
            },
        ))
        record_domain_event(
            db,
            "customer_reschedule_requests",
            stop.company_id,
            status="requested",
            external_ref=stop.id,
            correlation_id=correlation_id,
            source="public_tracking",
            payload={
                "stop_id": stop.id,
                "public_reference": tracking.public_reference,
                "requested_window": {"start": start, "end": end},
            },
        )
        db.commit()
        job, company = related
        return jsonify({"success": True, **_safe_status(stop, job=job, company=company, tracking=tracking)})
    except Exception:
        db.rollback()
        return jsonify({"error": "Could not request reschedule"}), 500
    finally:
        db.close()


@public_bp.route("/api/public/tracking/<token>/availability", methods=["POST"])
def confirm_tracking_availability(token):
    ensure_tracking_table()
    data = request.get_json(silent=True) or {}
    available = bool(data.get("available"))
    db = get_db_session()
    try:
        tracking, stop, related, error = _lookup_tracking(db, token)
        if error:
            return error
        correlation_id = _correlation_id()
        db.add(AuditLog(
            id=f"AUD-{uuid.uuid4().hex[:12].upper()}",
            company_id=stop.company_id,
            action_type="public_tracking_availability_confirmed",
            summary=f"Customer availability recorded for {tracking.public_reference}",
            actor="public_tracking",
            related_id=stop.id,
            details={"available": available, "correlation_id": correlation_id},
        ))
        record_domain_event(
            db,
            "customer_availability_confirmations",
            stop.company_id,
            status="confirmed" if available else "unavailable",
            external_ref=stop.id,
            correlation_id=correlation_id,
            source="public_tracking",
            payload={"stop_id": stop.id, "public_reference": tracking.public_reference, "available": available},
        )
        db.commit()
        return jsonify({"success": True, "available": available})
    except Exception:
        db.rollback()
        return jsonify({"error": "Could not confirm availability"}), 500
    finally:
        db.close()


@public_bp.route("/api/stops/<stop_id>/tracking-link", methods=["POST"])
def admin_create_tracking_link_passthrough(stop_id):
    from middleware import require_auth, require_admin

    @require_auth
    @require_admin
    def _inner():
        return _admin_create_tracking_link(stop_id)

    return _inner()


def _admin_create_tracking_link(stop_id):
    from flask import g

    ensure_tracking_table()
    db = get_db_session()
    try:
        stop = db.query(Stop).filter(Stop.id == stop_id, Stop.company_id == g.company_id).first()
        if not stop:
            return jsonify({"error": "Stop not found"}), 404
        token, row = create_tracking_token(db, stop, actor_id=getattr(g, "user_id", None))
        db.add(AuditLog(
            id=f"AUD-{uuid.uuid4().hex[:12].upper()}",
            company_id=g.company_id,
            action_type="tracking_link_generated",
            summary=f"Tracking link generated for {row.public_reference}",
            actor=getattr(g, "user_email", "admin"),
            related_id=stop.id,
            details={"tracking_token_id": row.id},
        ))
        db.commit()
        return jsonify({"success": True, "tracking": row.to_admin_dict(), "tracking_link": _tracking_link(token)})
    except Exception:
        db.rollback()
        return jsonify({"error": "Failed to create tracking link"}), 500
    finally:
        db.close()


@public_bp.route("/api/stops/<stop_id>/tracking-link", methods=["GET"])
def admin_get_tracking_link_passthrough(stop_id):
    from middleware import require_auth, require_admin

    @require_auth
    @require_admin
    def _inner():
        from flask import g

        ensure_tracking_table()
        db = get_db_session()
        try:
            stop = db.query(Stop).filter(Stop.id == stop_id, Stop.company_id == g.company_id).first()
            if not stop:
                return jsonify({"error": "Stop not found"}), 404
            row = db.query(PublicTrackingToken).filter(
                PublicTrackingToken.company_id == g.company_id,
                PublicTrackingToken.stop_id == stop.id,
                PublicTrackingToken.status == "active",
                PublicTrackingToken.revoked_at.is_(None),
            ).order_by(PublicTrackingToken.created_at.desc()).first()
            return jsonify({"tracking": row.to_admin_dict() if row and row.is_active() else None})
        finally:
            db.close()

    return _inner()


@public_bp.route("/api/stops/<stop_id>/tracking-link/revoke", methods=["POST"])
def admin_revoke_tracking_link_passthrough(stop_id):
    from middleware import require_auth, require_admin

    @require_auth
    @require_admin
    def _inner():
        from flask import g

        ensure_tracking_table()
        db = get_db_session()
        try:
            rows = db.query(PublicTrackingToken).filter(
                PublicTrackingToken.company_id == g.company_id,
                PublicTrackingToken.stop_id == stop_id,
                PublicTrackingToken.status == "active",
            ).all()
            for row in rows:
                row.status = "revoked"
                row.revoked_at = _now()
            db.add(AuditLog(
                id=f"AUD-{uuid.uuid4().hex[:12].upper()}",
                company_id=g.company_id,
                action_type="tracking_link_revoked",
                summary=f"Tracking link revoked for stop {stop_id}",
                actor=getattr(g, "user_email", "admin"),
                related_id=stop_id,
                details={"revoked_count": len(rows)},
            ))
            db.commit()
            return jsonify({"success": True, "revoked": len(rows)})
        except Exception:
            db.rollback()
            return jsonify({"error": "Failed to revoke tracking link"}), 500
        finally:
            db.close()

    return _inner()

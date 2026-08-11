import os
import traceback
import uuid
import hashlib
import hmac
import time
from datetime import datetime, timezone

from flask import request, jsonify, g
from geopy.geocoders import Nominatim
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from routes import orders_bp
from middleware import require_auth, require_admin
from models import Stop, Company, IntegrationSettings, AuditLog
from optimize_route import geocode_address, DEPOT
from orders_source import fetch_orders, orders_db_configured
from utils import get_db_session, record_domain_event

ORDER_ID_PREFIX = "STORE-"
MERCHANT_ORDER_ID_PREFIX = "MERCH-"
_merchant_rate_window = {}


def _store_order_id(order_id):
    return f"{ORDER_ID_PREFIX}{order_id}"


def _merchant_order_id(external_order_id):
    return f"{MERCHANT_ORDER_ID_PREFIX}{external_order_id}"


def _hash_api_key(api_key):
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def _correlation_id():
    return request.headers.get("X-Correlation-ID") or f"corr-{uuid.uuid4().hex}"


def _idempotency_key():
    return request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")


def _rate_limit_or_error(api_key_hash):
    limit = int(os.environ.get("MERCHANT_API_RATE_LIMIT_PER_MINUTE", "120"))
    now = time.time()
    window = int(now // 60)
    key = (api_key_hash, window)
    count = _merchant_rate_window.get(key, 0) + 1
    _merchant_rate_window[key] = count
    for old_key in list(_merchant_rate_window):
        if old_key[1] < window:
            _merchant_rate_window.pop(old_key, None)
    if count > limit:
        return {"error": "Rate limit exceeded", "retry_after_seconds": 60 - int(now % 60)}
    return None


def _require_merchant():
    api_key = (
        request.headers.get("X-Aiviate-Merchant-Key")
        or request.headers.get("X-Merchant-API-Key")
        or ""
    ).strip()
    if not api_key:
        return None, (jsonify({"error": "Merchant API key required"}), 401)

    api_key_hash = _hash_api_key(api_key)
    rate_error = _rate_limit_or_error(api_key_hash)
    if rate_error:
        return None, (jsonify(rate_error), 429)

    try:
        _ensure_integration_table()
    except Exception:
        traceback.print_exc()
        return None, (jsonify({"error": "Merchant integration storage is unavailable"}), 503)

    db = get_db_session()
    try:
        settings = db.query(IntegrationSettings).filter(
            IntegrationSettings.merchant_api_key_hash == api_key_hash
        ).first()
        if not settings or not hmac.compare_digest(settings.merchant_api_key_hash, api_key_hash):
            return None, (jsonify({"error": "Invalid merchant API key"}), 403)
        return {"company_id": settings.company_id, "key_prefix": settings.merchant_api_key_prefix}, None
    finally:
        db.close()


def _normalise_priority(value):
    value = (value or "standard").strip().lower()
    return value if value in {"standard", "high", "urgent"} else "standard"


def _canonical_order(data):
    errors = []
    external_order_id = str(data.get("external_order_id") or data.get("order_id") or "").strip()
    customer = data.get("customer") or {}
    address = data.get("address") or {}
    package = data.get("package") or {}
    delivery_window = data.get("delivery_window") or {}

    raw_address = str(
        data.get("raw_address")
        or address.get("raw")
        or address.get("line1")
        or data.get("shipping_address")
        or ""
    ).strip()
    customer_name = str(data.get("customer_name") or customer.get("name") or "").strip()
    customer_phone = str(data.get("customer_phone") or customer.get("phone") or "").strip()
    customer_email = str(data.get("customer_email") or customer.get("email") or "").strip()

    if not external_order_id:
        errors.append({"field": "external_order_id", "message": "external_order_id is required"})
    if not customer_name:
        errors.append({"field": "customer_name", "message": "customer name is required"})
    if not customer_phone:
        errors.append({"field": "customer_phone", "message": "customer phone is required"})
    if not raw_address:
        errors.append({"field": "raw_address", "message": "delivery address is required"})

    def float_or_none(*values):
        for value in values:
            if value is None or value == "":
                continue
            try:
                return float(value)
            except (TypeError, ValueError):
                return None
        return None

    def int_or_default(value, default):
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    lat = float_or_none(data.get("latitude"), address.get("latitude"), address.get("lat"))
    lng = float_or_none(data.get("longitude"), address.get("longitude"), address.get("lng"))
    status = "accepted" if lat is not None and lng is not None else "requires_address_review"

    return {
        "external_order_id": external_order_id,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "customer_email": customer_email,
        "raw_address": raw_address,
        "normalised_address": data.get("normalised_address") or raw_address,
        "latitude": lat,
        "longitude": lng,
        "geocoding_confidence": float_or_none(data.get("geocoding_confidence")),
        "package_weight": float_or_none(data.get("package_weight"), package.get("weight")) or 1.0,
        "package_volume": float_or_none(data.get("package_volume"), package.get("volume")) or 0.01,
        "priority": _normalise_priority(data.get("priority")),
        "delivery_window_start": data.get("delivery_window_start") or delivery_window.get("start") or "",
        "delivery_window_end": data.get("delivery_window_end") or delivery_window.get("end") or "",
        "service_time_minutes": int_or_default(data.get("service_time_minutes"), 15),
        "notes": str(data.get("notes") or "")[:500],
        "source": str(data.get("source") or "api").strip().lower(),
        "status": status,
        "errors": errors,
    }


def _canonical_from_stop(stop):
    return {
        "internal_order_id": stop.id,
        "external_order_id": (stop.order_id or "").replace(MERCHANT_ORDER_ID_PREFIX, "", 1),
        "tenant_id": stop.company_id,
        "customer_name": stop.customer_name,
        "customer_phone": stop.phone,
        "raw_address": stop.address,
        "normalised_address": stop.address,
        "latitude": stop.lat,
        "longitude": stop.lng,
        "package_weight": stop.demand,
        "package_volume": None,
        "priority": "standard",
        "delivery_window_start": stop.time_window_start,
        "delivery_window_end": stop.time_window_end,
        "service_time_minutes": stop.service_time,
        "notes": stop.notes,
        "status": "accepted" if stop.lat is not None and stop.lng is not None else "requires_address_review",
        "source": "api",
        "created_at": stop.created_at.isoformat() if stop.created_at else None,
    }


def _store_order_from_stop(stop):
    """Expose existing operational stops in the Orders UI shape.

    This is a compatibility bridge for deployments where Aiviate is already
    the operational source of truth and no separate storefront database exists.
    The Orders screen still expects the external-store payload shape, so keep
    the response customer-safe and mark records as already imported.
    """
    return {
        "id": stop.order_id or stop.id,
        "stop_id": stop.id,
        "customer_name": stop.customer_name or "",
        "customer_email": "",
        "customer_phone": stop.phone or "",
        "shipping_address": stop.address or "",
        "lat": float(stop.lat) if stop.lat is not None else None,
        "lng": float(stop.lng) if stop.lng is not None else None,
        "status": "delivered" if stop.completed else "dispatch_ready" if stop.job_id else "received",
        "payment_status": "",
        "total": 0.0,
        "created_at": stop.created_at.isoformat() if stop.created_at else None,
        "item_count": max(1, int(stop.demand or 1)),
        "item_summary": stop.notes or f"{max(1, int(stop.demand or 1))} package(s)",
        "imported": True,
        "importable": bool(stop.address),
        "source": "operational_stops",
        "job_id": stop.job_id,
        "completed": bool(stop.completed),
    }


def _list_operational_orders(company_id):
    db = get_db_session()
    try:
        stops = (
            db.query(Stop)
            .filter(Stop.company_id == company_id)
            .order_by(Stop.created_at.desc())
            .all()
        )
        return [_store_order_from_stop(s) for s in stops]
    finally:
        db.close()


def _insert_canonical_order(db, company_id, canonical, correlation_id, idempotency=None):
    order_id = _merchant_order_id(canonical["external_order_id"])
    existing = db.query(Stop).filter(
        Stop.company_id == company_id,
        Stop.order_id == order_id,
    ).first()
    if existing:
        return existing, "duplicate"

    if canonical["errors"]:
        return None, "rejected"

    stop = Stop(
        id=f"ORD-{uuid.uuid4().hex[:10].upper()}",
        order_id=order_id,
        customer_name=canonical["customer_name"],
        address=canonical["normalised_address"],
        lat=canonical["latitude"],
        lng=canonical["longitude"],
        demand=max(1, int(round(canonical["package_weight"]))),
        service_time=canonical["service_time_minutes"],
        phone=canonical["customer_phone"],
        notes=canonical["notes"],
        time_window_start=canonical["delivery_window_start"],
        time_window_end=canonical["delivery_window_end"],
        company_id=company_id,
    )
    db.add(stop)
    db.add(AuditLog(
        id=f"AUD-{uuid.uuid4().hex[:12].upper()}",
        company_id=company_id,
        action_type="order_imported",
        summary=f"Merchant order {canonical['external_order_id']} imported",
        actor="merchant_api",
        related_id=stop.id,
        details={
            "external_order_id": canonical["external_order_id"],
            "correlation_id": correlation_id,
            "idempotency_key": idempotency,
            "status": canonical["status"],
            "source": canonical["source"],
        },
    ))
    record_domain_event(
        db,
        "orders",
        company_id,
        status=canonical["status"],
        external_ref=canonical["external_order_id"],
        correlation_id=correlation_id,
        source=canonical["source"],
        payload={
            "internal_stop_id": stop.id,
            "external_order_id": canonical["external_order_id"],
            "customer_name": canonical["customer_name"],
            "customer_phone": canonical["customer_phone"],
            "customer_email": canonical["customer_email"],
            "priority": canonical["priority"],
            "delivery_window_start": canonical["delivery_window_start"],
            "delivery_window_end": canonical["delivery_window_end"],
            "service_time_minutes": canonical["service_time_minutes"],
            "legacy_stop_order_id": order_id,
        },
    )
    record_domain_event(
        db,
        "order_addresses",
        company_id,
        status=canonical["status"],
        external_ref=canonical["external_order_id"],
        correlation_id=correlation_id,
        source=canonical["source"],
        payload={
            "internal_stop_id": stop.id,
            "raw_address": canonical["raw_address"],
            "normalised_address": canonical["normalised_address"],
            "latitude": canonical["latitude"],
            "longitude": canonical["longitude"],
            "geocoding_confidence": canonical["geocoding_confidence"],
        },
    )
    record_domain_event(
        db,
        "order_packages",
        company_id,
        status="active",
        external_ref=canonical["external_order_id"],
        correlation_id=correlation_id,
        source=canonical["source"],
        payload={
            "internal_stop_id": stop.id,
            "package_weight": canonical["package_weight"],
            "package_volume": canonical["package_volume"],
            "demand": stop.demand,
        },
    )
    record_domain_event(
        db,
        "order_status_history",
        company_id,
        status=canonical["status"],
        external_ref=canonical["external_order_id"],
        correlation_id=correlation_id,
        source="merchant_api",
        payload={
            "internal_stop_id": stop.id,
            "status": canonical["status"],
            "reason": "merchant_order_ingested",
        },
    )
    if idempotency:
        record_domain_event(
            db,
            "idempotency_keys",
            company_id,
            status="used",
            external_ref=idempotency,
            correlation_id=correlation_id,
            source="merchant_api",
            payload={
                "scope": "merchant_order_ingestion",
                "external_order_id": canonical["external_order_id"],
                "internal_stop_id": stop.id,
            },
        )
    return stop, "created"


def _company_owns_store(company_id):
    """The external orders DB belongs to a single tenant.

    If ORDERS_COMPANY_ID is set, only that company may access it.
    Otherwise, allow access only when the deployment has exactly one
    company (single-tenant use) — never expose store data across tenants.
    """
    owner = os.environ.get("ORDERS_COMPANY_ID", "").strip()
    if owner:
        return company_id == owner
    db = get_db_session()
    try:
        return db.query(Company.id).count() == 1
    finally:
        db.close()


@orders_bp.route("/api/store/orders", methods=["GET"])
@require_auth
@require_admin
def list_store_orders():
    if not orders_db_configured() or not _company_owns_store(g.company_id):
        return jsonify({
            "configured": True,
            "source": "operational_stops",
            "orders": _list_operational_orders(g.company_id),
        })

    try:
        orders = fetch_orders()
    except Exception:
        traceback.print_exc()
        return jsonify({
            "configured": True,
            "source": "operational_stops",
            "warning": "External orders database is unavailable or not in storefront schema; showing Aiviate operational orders.",
            "orders": _list_operational_orders(g.company_id),
        })

    db = get_db_session()
    try:
        imported_ids = {
            s.order_id for s in db.query(Stop.order_id)
            .filter(Stop.company_id == g.company_id, Stop.order_id.like(f"{ORDER_ID_PREFIX}%"))
            .all()
        }
    finally:
        db.close()

    for o in orders:
        o["imported"] = _store_order_id(o["id"]) in imported_ids
        o["importable"] = bool(o["shipping_address"])

    return jsonify({"configured": True, "orders": orders})


@orders_bp.route("/api/store/orders/import", methods=["POST"])
@require_auth
@require_admin
def import_store_orders():
    if not orders_db_configured():
        return jsonify({"error": "Orders database is not configured"}), 400
    if not _company_owns_store(g.company_id):
        return jsonify({"error": "Your company does not have access to this orders database"}), 403

    data = request.get_json(silent=True) or {}
    requested_ids = data.get("order_ids")  # optional list; default = all importable

    if requested_ids is not None:
        if not isinstance(requested_ids, list):
            return jsonify({"error": "order_ids must be a list of order IDs"}), 400
        try:
            requested = {int(i) for i in requested_ids}
        except (TypeError, ValueError):
            return jsonify({"error": "order_ids must contain only numeric IDs"}), 400

    try:
        orders = fetch_orders()
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Could not reach the orders database"}), 502

    if requested_ids is not None:
        orders = [o for o in orders if o["id"] in requested]

    company_id = g.company_id
    db = get_db_session()
    imported, skipped, failed = [], [], []
    geolocator = None

    try:
        existing_ids = {
            s.order_id for s in db.query(Stop.order_id)
            .filter(Stop.company_id == company_id, Stop.order_id.like(f"{ORDER_ID_PREFIX}%"))
            .all()
        }

        for o in orders:
            store_id = _store_order_id(o["id"])
            if store_id in existing_ids:
                skipped.append({"order_id": o["id"], "reason": "Already imported"})
                continue
            if not o["shipping_address"]:
                failed.append({"order_id": o["id"], "reason": "No shipping address"})
                continue

            lat, lng = o["lat"], o["lng"]
            if lat is None or lng is None:
                if geolocator is None:
                    geolocator = Nominatim(user_agent="aiviate-dispatch-mvp", timeout=10)
                lat, lng = geocode_address(o["shipping_address"], geolocator)
                if lat == DEPOT["lat"] and lng == DEPOT["lng"]:
                    failed.append({"order_id": o["id"], "reason": "Could not geocode address"})
                    continue

            stop = Stop(
                id=str(uuid.uuid4().hex[:8]),
                order_id=store_id,
                customer_name=o["customer_name"] or f"Order {o['id']}",
                address=o["shipping_address"],
                lat=float(lat), lng=float(lng),
                demand=max(1, o["item_count"]),
                service_time=15,
                phone=o["customer_phone"] or "",
                notes=o["item_summary"][:500] if o["item_summary"] else "",
                time_window_start="", time_window_end="",
                company_id=company_id,
            )
            try:
                with db.begin_nested():
                    db.add(stop)
            except IntegrityError:
                # Concurrent import already inserted this order
                skipped.append({"order_id": o["id"], "reason": "Already imported"})
                continue
            imported.append(stop)

        db.commit()
        stops_out = [s.to_dict() for s in imported]
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to import orders"}), 500
    finally:
        db.close()

    return jsonify({
        "success": True,
        "imported": len(stops_out),
        "skipped": skipped,
        "failed": failed,
        "stops": stops_out,
    })


MAX_LOGO_CHARS = 400_000  # ~300KB image as a data URL
ALLOWED_LOGO_PREFIXES = (
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/webp;base64,",
)

_integration_table_ready = False


def _ensure_integration_table():
    """Create integration_settings on first use.

    Serverless runtimes (Vercel) skip init_db()/migrations at cold start,
    so an existing production DB may not have this table yet. checkfirst
    makes this a no-op once the table exists.
    """
    global _integration_table_ready
    if _integration_table_ready:
        return
    from models import engine
    IntegrationSettings.__table__.create(engine, checkfirst=True)
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns("integration_settings")]
    with engine.connect() as conn:
        if "merchant_api_key_hash" not in cols:
            conn.execute(text("ALTER TABLE integration_settings ADD COLUMN merchant_api_key_hash VARCHAR"))
        if "merchant_api_key_prefix" not in cols:
            conn.execute(text("ALTER TABLE integration_settings ADD COLUMN merchant_api_key_prefix VARCHAR"))
        if "merchant_api_key_created_at" not in cols:
            conn.execute(text("ALTER TABLE integration_settings ADD COLUMN merchant_api_key_created_at TIMESTAMP"))
        conn.commit()
    _integration_table_ready = True


@orders_bp.route("/api/store/integration", methods=["GET"])
@require_auth
@require_admin
def get_integration_settings():
    try:
        _ensure_integration_table()
    except Exception:
        traceback.print_exc()
        return jsonify({"settings": None})

    db = get_db_session()
    try:
        settings = db.query(IntegrationSettings).filter(
            IntegrationSettings.company_id == g.company_id
        ).first()
        return jsonify({"settings": settings.to_dict() if settings else None})
    finally:
        db.close()


@orders_bp.route("/api/store/integration", methods=["PUT"])
@require_auth
@require_admin
def update_integration_settings():
    try:
        _ensure_integration_table()
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Settings storage is unavailable right now"}), 503

    data = request.get_json(silent=True) or {}

    display_name = data.get("display_name")
    if display_name is not None:
        display_name = str(display_name).strip()[:80] or None

    logo = data.get("logo")
    if logo is not None and logo != "":
        logo = str(logo)
        if len(logo) > MAX_LOGO_CHARS:
            return jsonify({"error": "Logo image is too large"}), 400
        if not logo.startswith(ALLOWED_LOGO_PREFIXES):
            return jsonify({"error": "Logo must be a PNG, JPEG, or WebP image"}), 400
    elif logo == "":
        logo = None

    db = get_db_session()
    try:
        settings = db.query(IntegrationSettings).filter(
            IntegrationSettings.company_id == g.company_id
        ).first()
        if not settings:
            settings = IntegrationSettings(company_id=g.company_id)
            db.add(settings)

        if "display_name" in data:
            settings.display_name = display_name
        if "logo" in data:
            settings.logo = logo
        generated_key = None
        if data.get("rotate_merchant_api_key"):
            generated_key = IntegrationSettings.new_merchant_api_key()
            settings.merchant_api_key_hash = _hash_api_key(generated_key)
            settings.merchant_api_key_prefix = generated_key[:14]
            settings.merchant_api_key_created_at = datetime.now(timezone.utc)

        db.commit()
        payload = {"success": True, "settings": settings.to_dict()}
        if generated_key:
            payload["merchant_api_key"] = generated_key
            payload["message"] = "Store this key now. Aiviate only saves its hash."
        return jsonify(payload)
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to save integration settings"}), 500
    finally:
        db.close()


@orders_bp.route("/api/integrations/health", methods=["GET"])
def merchant_integration_health():
    merchant, error = _require_merchant()
    if error:
        return error
    return jsonify({
        "status": "ok",
        "service": "Aiviate merchant integration API",
        "tenant_id": merchant["company_id"],
        "correlation_id": _correlation_id(),
    })


@orders_bp.route("/api/integrations/orders", methods=["POST"])
def create_merchant_order():
    merchant, error = _require_merchant()
    if error:
        return error

    correlation_id = _correlation_id()
    idempotency = _idempotency_key()
    canonical = _canonical_order(request.get_json(silent=True) or {})
    if canonical["errors"]:
        return jsonify({
            "success": False,
            "status": "rejected",
            "correlation_id": correlation_id,
            "errors": canonical["errors"],
        }), 422

    db = get_db_session()
    try:
        stop, outcome = _insert_canonical_order(
            db, merchant["company_id"], canonical, correlation_id, idempotency
        )
        if outcome == "duplicate":
            db.rollback()
            return jsonify({
                "success": True,
                "status": "accepted",
                "duplicate": True,
                "correlation_id": correlation_id,
                "order": _canonical_from_stop(stop),
            })
        db.commit()
        return jsonify({
            "success": True,
            "status": canonical["status"],
            "duplicate": False,
            "correlation_id": correlation_id,
            "order": _canonical_from_stop(stop),
        }), 201
    except IntegrityError:
        db.rollback()
        existing = db.query(Stop).filter(
            Stop.company_id == merchant["company_id"],
            Stop.order_id == _merchant_order_id(canonical["external_order_id"]),
        ).first()
        return jsonify({
            "success": True,
            "status": "accepted",
            "duplicate": True,
            "correlation_id": correlation_id,
            "order": _canonical_from_stop(existing) if existing else None,
        })
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to import merchant order", "correlation_id": correlation_id}), 500
    finally:
        db.close()


@orders_bp.route("/api/integrations/orders/bulk", methods=["POST"])
def create_merchant_orders_bulk():
    merchant, error = _require_merchant()
    if error:
        return error

    correlation_id = _correlation_id()
    data = request.get_json(silent=True) or {}
    items = data.get("orders") if isinstance(data, dict) else None
    if not isinstance(items, list) or not items:
        return jsonify({
            "success": False,
            "status": "rejected",
            "correlation_id": correlation_id,
            "errors": [{"field": "orders", "message": "orders must be a non-empty list"}],
        }), 422

    db = get_db_session()
    accepted, rejected = [], []
    try:
        for item in items:
            canonical = _canonical_order(item if isinstance(item, dict) else {})
            if canonical["errors"]:
                rejected.append({
                    "external_order_id": canonical["external_order_id"],
                    "status": "rejected",
                    "errors": canonical["errors"],
                })
                continue
            stop, outcome = _insert_canonical_order(
                db, merchant["company_id"], canonical, correlation_id, _idempotency_key()
            )
            accepted.append({
                "external_order_id": canonical["external_order_id"],
                "status": canonical["status"],
                "duplicate": outcome == "duplicate",
                "internal_order_id": stop.id,
            })
        db.commit()
        return jsonify({
            "success": not rejected,
            "correlation_id": correlation_id,
            "accepted": accepted,
            "rejected": rejected,
        }), 207 if rejected else 201
    except IntegrityError:
        db.rollback()
        return jsonify({
            "success": False,
            "error": "Duplicate order conflict; retry with the same external_order_id to fetch the existing order",
            "correlation_id": correlation_id,
        }), 409
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to import merchant orders", "correlation_id": correlation_id}), 500
    finally:
        db.close()


@orders_bp.route("/api/integrations/orders/<external_order_id>", methods=["GET"])
def get_merchant_order(external_order_id):
    merchant, error = _require_merchant()
    if error:
        return error

    db = get_db_session()
    try:
        stop = db.query(Stop).filter(
            Stop.company_id == merchant["company_id"],
            Stop.order_id == _merchant_order_id(external_order_id),
        ).first()
        if not stop:
            return jsonify({"error": "Order not found", "correlation_id": _correlation_id()}), 404
        return jsonify({
            "success": True,
            "correlation_id": _correlation_id(),
            "order": _canonical_from_stop(stop),
        })
    finally:
        db.close()

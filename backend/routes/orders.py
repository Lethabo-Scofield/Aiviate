import os
import traceback
import uuid

from flask import request, jsonify, g
from geopy.geocoders import Nominatim
from sqlalchemy.exc import IntegrityError

from routes import orders_bp
from middleware import require_auth, require_admin
from models import Stop, Company, IntegrationSettings
from optimize_route import geocode_address, DEPOT
from orders_source import fetch_orders, orders_db_configured
from utils import get_db_session

ORDER_ID_PREFIX = "STORE-"


def _store_order_id(order_id):
    return f"{ORDER_ID_PREFIX}{order_id}"


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
        return jsonify({"configured": False, "orders": []})

    try:
        orders = fetch_orders()
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Could not reach the orders database"}), 502

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

        db.commit()
        return jsonify({"success": True, "settings": settings.to_dict()})
    except Exception:
        db.rollback()
        traceback.print_exc()
        return jsonify({"error": "Failed to save integration settings"}), 500
    finally:
        db.close()

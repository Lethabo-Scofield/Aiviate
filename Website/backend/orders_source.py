"""Read-only connection to the external e-commerce orders database.

Configured via the ORDERS_DATABASE_KEY environment variable (a Postgres
connection string). All queries here are SELECT-only — the store database
is never modified by the dispatch app.
"""
import os
import ssl as _ssl
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

_engine = None


def orders_db_configured():
    return bool(os.environ.get("ORDERS_DATABASE_KEY"))


def _store_name_filter():
    return (os.environ.get("ORDERS_STORE_NAME") or "").strip()


def _get_engine():
    global _engine
    if _engine is None:
        url = os.environ.get("ORDERS_DATABASE_KEY")
        if not url:
            raise RuntimeError("ORDERS_DATABASE_KEY environment variable is not set")

        # Use the pg8000 driver (pure Python) — psycopg2 is not available in
        # the slim serverless runtime. Mirrors the URL handling in models.py.
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        use_ssl = params.pop("sslmode", [None])[0] in ("require", "verify-ca", "verify-full", None)
        params.pop("channel_binding", None)
        new_query = urlencode({k: v[0] for k, v in params.items()})
        url = urlunparse(parsed._replace(
            scheme="postgresql+pg8000",
            query=new_query,
        ))

        connect_args = {}
        if use_ssl:
            ssl_ctx = _ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = _ssl.CERT_NONE
            connect_args["ssl_context"] = ssl_ctx
        connect_args["timeout"] = int(os.environ.get("DB_CONNECT_TIMEOUT", "10"))

        _engine = create_engine(url, poolclass=NullPool, connect_args=connect_args)
    return _engine


def fetch_orders():
    """Fetch orders from the configured store database.

    Preferred schema is storefront-style `orders` + `order_items`. Some
    existing Aiviate-connected store databases already store delivery orders as
    operational `stops`; support that shape as a read-only store source too.
    """
    engine = _get_engine()
    with engine.connect() as conn:
        tables = {
            row["table_name"]
            for row in conn.execute(text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
            """)).mappings()
        }
        if "orders" in tables and _table_has_rows(conn, "orders"):
            return _fetch_storefront_orders(conn, "order_items" in tables)
        if "stops" in tables:
            return _fetch_operational_stop_orders(conn)
        raise RuntimeError("Orders database has neither orders nor stops table")


def source_kind():
    """Return the detected store source kind without exposing connection data."""
    if not orders_db_configured():
        return "none"
    engine = _get_engine()
    with engine.connect() as conn:
        tables = {
            row["table_name"]
            for row in conn.execute(text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
            """)).mappings()
        }
        if "orders" in tables and _table_has_rows(conn, "orders"):
            return "storefront_orders"
        if "stops" in tables:
            return "operational_stops"
        return "unknown"


def _table_has_rows(conn, table_name):
    return bool(conn.execute(text(f"SELECT EXISTS (SELECT 1 FROM {table_name} LIMIT 1)")).scalar())


def _fetch_storefront_orders(conn, has_order_items=True):
    item_join = """
        LEFT JOIN (
            SELECT order_id,
                   SUM(quantity) AS item_count,
                   STRING_AGG(product_name || ' x' || quantity, ', ' ORDER BY id) AS item_summary
            FROM order_items
            GROUP BY order_id
        ) items ON items.order_id = o.id
    """ if has_order_items else ""
    item_select = (
        "COALESCE(items.item_count, 0) AS item_count,"
        "COALESCE(items.item_summary, '') AS item_summary"
    ) if has_order_items else "1 AS item_count, '' AS item_summary"

    rows = conn.execute(text(f"""
        SELECT o.id, o.customer_name, o.customer_email, o.customer_phone,
               o.shipping_address, o.shipping_latitude, o.shipping_longitude,
               o.status, o.payment_status, o.total, o.created_at,
               {item_select}
        FROM orders o
        {item_join}
        ORDER BY o.created_at DESC
    """)).mappings().all()

    orders = []
    for r in rows:
        orders.append({
            "id": r["id"],
            "customer_name": r["customer_name"] or "",
            "customer_email": r["customer_email"] or "",
            "customer_phone": r["customer_phone"] or "",
            "shipping_address": r["shipping_address"] or "",
            "lat": float(r["shipping_latitude"]) if r["shipping_latitude"] is not None else None,
            "lng": float(r["shipping_longitude"]) if r["shipping_longitude"] is not None else None,
            "status": r["status"] or "",
            "payment_status": r["payment_status"] or "",
            "total": float(r["total"]) if r["total"] is not None else 0.0,
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "item_count": int(r["item_count"]),
            "item_summary": r["item_summary"],
        })
    return orders


def _fetch_operational_stop_orders(conn):
    store_name = _store_name_filter()
    where_clause = "WHERE customer_name = :store_name" if store_name else ""
    params = {"store_name": store_name} if store_name else {}

    rows = conn.execute(text(f"""
        SELECT id, order_id, customer_name, address, lat, lng, demand,
               service_time, phone, notes, job_id, completed, created_at
        FROM stops
        {where_clause}
        ORDER BY created_at DESC
    """), params).mappings().all()

    orders = []
    for r in rows:
        item_count = max(1, int(r["demand"] or 1))
        orders.append({
            "id": r["order_id"] or r["id"],
            "customer_name": r["customer_name"] or "",
            "customer_email": "",
            "customer_phone": r["phone"] or "",
            "shipping_address": r["address"] or "",
            "lat": float(r["lat"]) if r["lat"] is not None else None,
            "lng": float(r["lng"]) if r["lng"] is not None else None,
            "status": "delivered" if r["completed"] else "dispatch_ready" if r["job_id"] else "received",
            "payment_status": "",
            "total": 0.0,
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "item_count": item_count,
            "item_summary": r["notes"] or f"{item_count} package(s)",
        })
    return orders

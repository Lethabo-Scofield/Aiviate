"""Read-only connection to the external e-commerce orders database.

Configured via the ORDERS_DATABASE_KEY environment variable (a Postgres
connection string). All queries here are SELECT-only — the store database
is never modified by the dispatch app.
"""
import os

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

_engine = None


def orders_db_configured():
    return bool(os.environ.get("ORDERS_DATABASE_KEY"))


def _get_engine():
    global _engine
    if _engine is None:
        url = os.environ.get("ORDERS_DATABASE_KEY")
        if not url:
            raise RuntimeError("ORDERS_DATABASE_KEY environment variable is not set")
        _engine = create_engine(url, poolclass=NullPool)
    return _engine


def fetch_orders():
    """Fetch orders from the store database with their line items."""
    engine = _get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT o.id, o.customer_name, o.customer_email, o.customer_phone,
                   o.shipping_address, o.shipping_latitude, o.shipping_longitude,
                   o.status, o.payment_status, o.total, o.created_at,
                   COALESCE(items.item_count, 0) AS item_count,
                   COALESCE(items.item_summary, '') AS item_summary
            FROM orders o
            LEFT JOIN (
                SELECT order_id,
                       SUM(quantity) AS item_count,
                       STRING_AGG(product_name || ' x' || quantity, ', ' ORDER BY id) AS item_summary
                FROM order_items
                GROUP BY order_id
            ) items ON items.order_id = o.id
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

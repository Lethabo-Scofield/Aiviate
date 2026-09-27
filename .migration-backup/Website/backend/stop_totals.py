from decimal import Decimal

from sqlalchemy import bindparam, inspect, text

from models import engine


def _num(value):
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def orders_table_exists():
    return "orders" in inspect(engine).get_table_names()


def stop_total_amount_exists():
    inspector = inspect(engine)
    if "stops" not in inspector.get_table_names():
        return False
    return any(col["name"] == "total_amount" for col in inspector.get_columns("stops"))


def stop_display_totals(db, company_id=None, stop_ids=None):
    """Return {stop_id: display_total} using stops.total_amount first.

    BulkMart historical stops have order_id values like STORE-42 and totals in
    the storefront orders table. Keep this lookup read-only and additive.
    """
    params = {}
    filters = []
    if company_id:
        filters.append("s.company_id = :company_id")
        params["company_id"] = company_id
    if stop_ids:
        filters.append("s.id IN :stop_ids")
        params["stop_ids"] = list(stop_ids)
    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    has_total_amount = stop_total_amount_exists()
    has_orders = orders_table_exists()

    if has_total_amount and has_orders:
        sql = f"""
            SELECT s.id,
                   COALESCE(NULLIF(s.total_amount, 0), sto_order.total, 0) AS display_total
            FROM stops s
            LEFT JOIN orders sto_order
              ON s.order_id = 'STORE-' || sto_order.id::text
            {where_clause}
        """
    elif has_orders:
        sql = f"""
            SELECT s.id,
                   COALESCE(sto_order.total, 0) AS display_total
            FROM stops s
            LEFT JOIN orders sto_order
              ON s.order_id = 'STORE-' || sto_order.id::text
            {where_clause}
        """
    elif has_total_amount:
        sql = f"""
            SELECT s.id,
                   COALESCE(s.total_amount, 0) AS display_total
            FROM stops s
            {where_clause}
        """
    else:
        sql = f"""
            SELECT s.id,
                   0 AS display_total
            FROM stops s
            {where_clause}
        """

    statement = text(sql)
    if stop_ids:
        statement = statement.bindparams(bindparam("stop_ids", expanding=True))
    rows = db.execute(statement, params).mappings().all()
    return {row["id"]: _num(row["display_total"]) for row in rows}


def stop_to_dict_with_total(stop, totals):
    return stop.to_dict(display_total=totals.get(stop.id))

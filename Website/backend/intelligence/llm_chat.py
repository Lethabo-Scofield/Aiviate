"""LLM-backed operator chat.

The logistics agents and route decisions stay deterministic. This module handles
the conversational layer: explanations, summaries, and business questions over
real operational context.
"""
import os
import json
from datetime import datetime, timezone

import requests
from sqlalchemy import text


class LLMUnavailable(RuntimeError):
    pass


def is_configured():
    return bool(_openai_key() or _google_key())


def _openai_key():
    key = os.environ.get("OPENAI_API_KEY", "")
    # Google API keys often start with AIza. They are valid LLM keys, just not
    # for OpenAI's endpoint.
    if key.startswith("AIza"):
        return ""
    return key


def _google_key():
    return os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY") or (
        os.environ.get("OPENAI_API_KEY") if os.environ.get("OPENAI_API_KEY", "").startswith("AIza") else ""
    )


def _scalar(db, sql, params):
    try:
        return db.execute(text(sql), params).scalar() or 0
    except Exception:  # noqa: BLE001
        return 0


def _sample_rows(db, sql, params, limit=5):
    try:
        rows = db.execute(text(sql), {**params, "limit": limit}).mappings().all()
        return [dict(row) for row in rows]
    except Exception:  # noqa: BLE001
        return []


def build_context(db, company_id):
    params = {"company_id": company_id}
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "company_id": company_id,
        "counts": {
            "storefront_orders": _scalar(db, "select count(*) from orders", params),
            "storefront_order_items": _scalar(db, "select count(*) from order_items", params),
            "storefront_stops": _scalar(
                db,
                "select count(*) from stops where company_id = :company_id and order_id like 'STORE-%'",
                params,
            ),
            "seeded_or_admin_stops": _scalar(
                db,
                "select count(*) from stops where company_id = :company_id and order_id not like 'STORE-%'",
                params,
            ),
            "storefront_delivery_jobs": _scalar(
                db,
                """
                select count(distinct j.id)
                from jobs j
                join stops s on s.job_id = j.id
                where j.company_id = :company_id and s.order_id like 'STORE-%'
                """,
                params,
            ),
            "seeded_or_admin_jobs": _scalar(
                db,
                """
                select count(distinct j.id)
                from jobs j
                join stops s on s.job_id = j.id
                where j.company_id = :company_id and s.order_id not like 'STORE-%'
                """,
                params,
            ),
            "drivers": _scalar(db, "select count(*) from drivers where company_id = :company_id", params),
            "jobs": _scalar(db, "select count(*) from jobs where company_id = :company_id", params),
            "active_jobs": _scalar(
                db,
                "select count(*) from jobs where company_id = :company_id and status in ('assigned', 'in_progress')",
                params,
            ),
            "open_alerts": _scalar(
                db,
                "select count(*) from alerts where company_id = :company_id and is_read = false",
                params,
            ),
        },
        "recent_store_orders": _sample_rows(
            db,
            """
            select id, customer_name, customer_phone, shipping_address, total, status, created_at
            from orders
            order by created_at desc nulls last, id desc
            limit :limit
            """,
            params,
        ),
        "recent_store_stops": _sample_rows(
            db,
            """
            select id, order_id, customer_name, address, status, job_id, total_amount, created_at
            from stops
            where company_id = :company_id and order_id like 'STORE-%'
            order by created_at desc nulls last, id desc
            limit :limit
            """,
            params,
        ),
        "drivers": _sample_rows(
            db,
            """
            select id, name, email, status, blocked, vehicle_type
            from drivers
            where company_id = :company_id
            order by name asc
            limit :limit
            """,
            params,
            limit=8,
        ),
        "jobs": _sample_rows(
            db,
            """
            select distinct j.id, j.area, j.status, j.driver_name, j.total_stops,
                   j.total_distance_km, j.created_at
            from jobs j
            join stops s on s.job_id = j.id
            where j.company_id = :company_id and s.order_id like 'STORE-%'
            order by j.created_at desc nulls last, j.id desc
            limit :limit
            """,
            params,
            limit=8,
        ),
        "seeded_or_admin_jobs_sample": _sample_rows(
            db,
            """
            select distinct j.id, j.area, j.status, j.driver_name, j.total_stops,
                   j.total_distance_km, j.created_at
            from jobs j
            join stops s on s.job_id = j.id
            where j.company_id = :company_id and s.order_id not like 'STORE-%'
            order by j.created_at desc nulls last, j.id desc
            limit :limit
            """,
            params,
            limit=4,
        ),
    }


def answer(db, company_id, user_text, parse_error=None):
    context = build_context(db, company_id)
    system = (
        "You are Aiviate, an operations copilot for a last-mile delivery admin app. "
        "Use the provided operational context. Answer naturally, like a business copilot, not like a command menu. "
        "Avoid listing example commands unless the user explicitly asks for help. Be concise, practical, and honest. "
        "BulkMart storefront orders are the real customer orders. In this database, real storefront work uses order IDs starting with STORE-. "
        "Order IDs starting with ORD- are seeded/admin/demo data; do not describe them as real customer demand unless the user explicitly asks about seeded/admin data. "
        "When the user asks about available jobs or orders, prioritize storefront_orders, storefront_stops, and storefront_delivery_jobs. "
        "If storefront orders exist but storefront_delivery_jobs is zero, explain that the order exists but has not yet been turned into a real delivery job. "
        "Do not claim that an action was executed unless the context explicitly says so. "
        "Do not make route-optimization or safety decisions yourself; suggest using the app's deterministic actions. "
        "If the user asks for a mutation like assigning a driver, explain the exact command/button to use instead of pretending you did it."
    )
    user_payload = {
        "question": user_text,
        "parser_error": parse_error,
        "operational_context": context,
    }
    if _openai_key():
        return _answer_openai(system, user_payload, context)
    if _google_key():
        return _answer_gemini(system, user_payload, context)
    raise LLMUnavailable("No LLM key is set for the backend process")


def _answer_openai(system, user_payload, context):
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {_openai_key()}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user_payload, default=str)},
            ],
        },
        timeout=30,
    )
    _raise_clear_http_error(response, "OpenAI")
    data = response.json()
    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )
    if not content:
        raise LLMUnavailable("LLM returned an empty response")
    return {
        "ok": True,
        "type": "llm",
        "summary": content,
        "llm": True,
        "model": model,
        "context_counts": context["counts"],
    }


def _answer_gemini(system, user_payload, context):
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    response = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        params={"key": _google_key()},
        headers={"Content-Type": "application/json"},
        json={
            "systemInstruction": {
                "parts": [{"text": system}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": json.dumps(user_payload, default=str)}],
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 500,
            },
        },
        timeout=30,
    )
    _raise_clear_http_error(response, "Gemini")
    data = response.json()
    parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    content = "\n".join(p.get("text", "") for p in parts).strip()
    if not content:
        raise LLMUnavailable("LLM returned an empty response")
    return {
        "ok": True,
        "type": "llm",
        "summary": content,
        "llm": True,
        "model": model,
        "provider": "gemini",
        "context_counts": context["counts"],
    }


def _raise_clear_http_error(response, provider):
    if response.ok:
        return
    message = f"{provider} returned HTTP {response.status_code}"
    try:
        payload = response.json()
        error = payload.get("error") or {}
        reason = error.get("code") or error.get("status") or error.get("type")
        detail = error.get("message")
        if reason or detail:
            message = f"{provider} rejected the LLM request"
            if reason:
                message += f" ({reason})"
            if detail:
                message += f": {detail}"
    except Exception:  # noqa: BLE001
        pass
    raise LLMUnavailable(message)

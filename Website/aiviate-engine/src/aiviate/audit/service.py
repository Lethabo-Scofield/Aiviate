"""Decision audit records and human-readable explanations.

Every consequential decision (plan creation, validation, publication,
assignment, re-optimisation, safety action, admin override) is stored with
its input snapshot, the rules applied, the machine result and a prose
explanation. A route is never stored without the "why" that produced it.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from aiviate.db import tables as t
from aiviate.observability import get_correlation_id, get_logger, log_ctx

logger = get_logger(__name__)


def record_decision(
    session: Session,
    organisation_id: str,
    decision_type: str,
    explanation: str,
    plan_id: str | None = None,
    input_snapshot: dict[str, Any] | None = None,
    rules_applied: list[dict[str, Any]] | None = None,
    decision_result: dict[str, Any] | None = None,
) -> t.DecisionAuditRow:
    row = t.DecisionAuditRow(
        organisation_id=organisation_id,
        plan_id=plan_id,
        decision_type=decision_type,
        input_snapshot=input_snapshot or {},
        rules_applied=rules_applied or [],
        decision_result=decision_result or {},
        explanation=explanation,
        correlation_id=get_correlation_id(),
    )
    session.add(row)
    logger.info("decision recorded", extra=log_ctx(decision_type=decision_type, plan_id=plan_id))
    return row


def plan_explanation(session: Session, organisation_id: str, plan_id: str) -> dict[str, Any]:
    """All audit records for a plan, oldest first, ready for the Admin UI."""
    rows = session.execute(
        select(t.DecisionAuditRow)
        .where(
            t.DecisionAuditRow.organisation_id == organisation_id,
            t.DecisionAuditRow.plan_id == plan_id,
        )
        .order_by(t.DecisionAuditRow.created_at, t.DecisionAuditRow.id)
    ).scalars()
    decisions = [
        {
            "decision_type": row.decision_type,
            "explanation": row.explanation,
            "rules_applied": row.rules_applied,
            "decision_result": row.decision_result,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]
    return {"plan_id": plan_id, "decisions": decisions}

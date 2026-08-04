"""Append-only audit log for any operational action — autonomous or
human-approved. Every recommendation acknowledgement and every workflow
side-effect lands here."""
import uuid
from typing import Dict, Optional

from models import AuditLog


def log_action(
    db,
    *,
    company_id: str,
    action_type: str,
    summary: str,
    actor: str = "system",
    confidence: float = 1.0,
    requires_approval: bool = False,
    related_id: Optional[str] = None,
    details: Optional[Dict] = None,
) -> AuditLog:
    entry = AuditLog(
        id=str(uuid.uuid4()),
        company_id=company_id,
        action_type=action_type,
        summary=summary,
        actor=actor,
        confidence=confidence,
        requires_approval=requires_approval,
        related_id=related_id,
        details=details or {},
    )
    db.add(entry)
    db.commit()
    return entry

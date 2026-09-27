"""Rules whose action requires no human approval run here, with side-effects
recorded in the audit log. Today this is intentionally tiny — only the
low-battery alert auto-creation — because the system has no real messaging
provider wired yet. Adding more autonomous rules is an additive change:
write the rule, write the audit entry, done.
"""
import uuid
from typing import Dict, List

from models import Alert
from intelligence.audit_logger import log_action


def run_autonomous_workflows(
    db, *, company_id: str, device_anomalies: List[Dict]
) -> List:
    """Apply approval-free rules. Returns the audit entries written.

    Preloads existing unread battery_low alerts in one query (kills the N+1)
    and uses IntegrityError-safe commits to shrink the concurrency race window.
    """
    from sqlalchemy.exc import IntegrityError

    written: List = []
    battery_anomalies = [d for d in device_anomalies if d.get("kind") == "battery_low"]
    if not battery_anomalies:
        return written

    # Single query: load every unread battery_low alert for this company once.
    existing_alerts = (
        db.query(Alert)
        .filter(
            Alert.company_id == company_id,
            Alert.type == "battery_low",
            Alert.is_read == False,  # noqa: E712
        )
        .all()
    )
    covered_ids = set()
    for a in existing_alerts:
        msg = a.message or ""
        for d in battery_anomalies:
            sid = d.get("subject_id") or ""
            if sid and sid in msg:
                covered_ids.add(sid)

    for d in battery_anomalies:
        subject_id = d.get("subject_id") or ""
        if not subject_id or subject_id in covered_ids:
            continue

        alert = Alert(
            id=str(uuid.uuid4()),
            type="battery_low",
            severity="warning",
            title=f"Battery low: {d.get('subject_name')}",
            message=(
                f"Device {subject_id} reporting {d.get('what')}. "
                "Recommend plug-in at the next stop."
            ),
            company_id=company_id,
        )
        db.add(alert)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue

        covered_ids.add(subject_id)
        entry = log_action(
            db,
            company_id=company_id,
            action_type="alert_created",
            summary=f"Created low-battery alert for {d.get('subject_name')}",
            actor="workflow_engine",
            confidence=0.99,
            requires_approval=False,
            related_id=subject_id,
        )
        written.append(entry)

    return written

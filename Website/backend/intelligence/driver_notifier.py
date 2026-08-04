"""Driver notification helper.

HONESTY: there is no outbound SMS/push transport wired. "Notifying a
driver" today means writing an Alert row addressed to that driver
plus an audit entry — the driver sees it the next time they open the
app. When a real channel is added, swap the implementation; callers
do not change.
"""
import uuid

from models import Alert, AuditLog  # noqa: F401
from intelligence.audit_logger import log_action


def notify_driver(db, *, company_id, driver_id, driver_name, title,
                  message, severity="info", alert_type="route_update",
                  actor="agent"):
    """Persist a driver-facing alert and an audit entry. Returns the alert dict."""
    alert = Alert(
        id=str(uuid.uuid4()),
        type=alert_type,
        severity=severity,
        title=title,
        message=message,
        driver_id=driver_id,
        company_id=company_id,
    )
    db.add(alert)
    db.commit()
    log_action(
        db, company_id=company_id, action_type="driver_notified",
        summary=f"Notified {driver_name or driver_id}: {title}",
        actor=actor, confidence=1.0, requires_approval=False,
        related_id=driver_id,
        details={"alert_id": alert.id, "type": alert_type, "message": message},
    )
    return {
        "id": alert.id, "type": alert.type, "severity": alert.severity,
        "title": alert.title, "message": alert.message,
        "driver_id": driver_id, "driver_name": driver_name,
    }

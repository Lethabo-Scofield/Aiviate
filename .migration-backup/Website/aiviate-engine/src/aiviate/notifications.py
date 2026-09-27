"""Notification ports.

Delivery channels are pluggable; the engine only depends on these protocols.
The default adapters log and record — real SMS/push/voice integrations plug in
via configuration (see README). The voice-escalation port (e.g. Retell AI)
places calls only; accident determination stays with the safety controller's
multi-signal confirmation policy.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from aiviate.observability import get_logger, log_ctx

logger = get_logger(__name__)

RecipientType = Literal["driver", "administrator", "escalation_contact"]


@dataclass
class Notification:
    recipient_type: RecipientType
    recipient_id: str
    subject: str
    body: str
    channel: str = "log"


class Notifier(Protocol):
    def send(self, notification: Notification) -> bool:
        """Deliver one notification. Returns True when accepted for delivery."""
        ...


class VoiceEscalationPort(Protocol):
    def place_call(self, contact: str, script: str) -> bool:
        """Place an escalation call. Never used to decide whether an incident occurred."""
        ...


class LoggingNotifier:
    """Default adapter: records every notification and logs it."""

    def __init__(self) -> None:
        self.sent: list[Notification] = []

    def send(self, notification: Notification) -> bool:
        self.sent.append(notification)
        logger.info(
            "notification",
            extra=log_ctx(
                recipient_type=notification.recipient_type,
                recipient_id=notification.recipient_id,
                subject=notification.subject,
            ),
        )
        return True


class LoggingVoiceEscalation:
    """Stub voice adapter: records intended calls without placing them."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def place_call(self, contact: str, script: str) -> bool:
        self.calls.append((contact, script))
        logger.warning("voice escalation call (stub)", extra=log_ctx(contact=contact))
        return True

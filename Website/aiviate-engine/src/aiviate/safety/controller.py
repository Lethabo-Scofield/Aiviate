"""Safety events as operational constraints.

Fatigue: warn → update safety status → notify admin → require a break after
repeated warnings → flag re-optimisation when the driver holds an active route.

Accidents: one weak signal never suspends a route or places an emergency call.
POSSIBLE_ACCIDENT puts the route on safety hold and requests confirmation; the
route is suspended (and orders returned to dispatch) only when the configured
number of corroborating signals arrives inside the confirmation window, or an
explicit ACCIDENT_CONFIRMED / MANUAL_EMERGENCY event occurs. Voice escalation
(Retell AI or similar) only places calls — it never decides anything.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from aiviate.audit import record_decision
from aiviate.db import tables as t
from aiviate.db.repo import DriverRepo, OrderRepo, OrganisationRepo, PlanRepo
from aiviate.domain import models as m
from aiviate.domain.enums import (
    DecisionType,
    EventType,
    OrderStatus,
    RouteStatus,
    SafetyStatus,
    StopStatus,
)
from aiviate.notifications import (
    LoggingNotifier,
    LoggingVoiceEscalation,
    Notification,
    Notifier,
    VoiceEscalationPort,
)
from aiviate.observability import get_correlation_id, get_logger, log_ctx, metrics
from aiviate.rules import SafetyPolicy, resolve_rules

logger = get_logger(__name__)

_CORROBORATING = {EventType.POSSIBLE_ACCIDENT, EventType.DRIVER_UNRESPONSIVE}


@dataclass
class SafetyActionResult:
    event_id: str
    actions: list[str] = field(default_factory=list)
    driver_safety_status: SafetyStatus | None = None
    route_status: RouteStatus | None = None
    returned_order_ids: list[str] = field(default_factory=list)
    reoptimisation_required: bool = False
    reoptimisation_route_id: str | None = None
    notifications: list[Notification] = field(default_factory=list)
    duplicate: bool = False


def process_safety_event(
    session: Session,
    organisation_id: str,
    event: m.OperationalEvent,
    dedupe_key: str | None = None,
    notifier: Notifier | None = None,
    voice: VoiceEscalationPort | None = None,
) -> SafetyActionResult:
    notifier = notifier or LoggingNotifier()
    voice = voice or LoggingVoiceEscalation()
    org = OrganisationRepo.get(session, organisation_id)
    if org is None:
        raise ValueError("unknown organisation")
    policy = resolve_rules(org.operating_rules).safety

    if dedupe_key is not None:
        existing = session.execute(
            select(t.OperationalEventRow.id).where(
                t.OperationalEventRow.organisation_id == organisation_id,
                t.OperationalEventRow.dedupe_key == dedupe_key,
            )
        ).scalar_one_or_none()
        if existing is not None:
            return SafetyActionResult(event_id=existing, duplicate=True)

    row = t.OperationalEventRow(
        **event.model_dump(exclude={"id", "processed_at"}),
        dedupe_key=dedupe_key,
        correlation_id=get_correlation_id(),
    )
    session.add(row)
    session.flush()
    metrics.increment(f"safety.events.{event.event_type}")

    result = SafetyActionResult(event_id=row.id)
    handler = {
        EventType.FATIGUE_WARNING: _handle_fatigue,
        EventType.BREAK_REQUIRED: _handle_break_required,
        EventType.DRIVER_UNRESPONSIVE: _handle_possible_accident,
        EventType.POSSIBLE_ACCIDENT: _handle_possible_accident,
        EventType.ACCIDENT_CONFIRMED: _handle_confirmed_accident,
        EventType.MANUAL_EMERGENCY: _handle_confirmed_accident,
        EventType.DEVICE_OFFLINE: _handle_device_offline,
    }.get(event.event_type)
    if handler is None:
        raise ValueError(f"'{event.event_type}' is not a safety event")
    handler(session, organisation_id, event, policy, result, notifier, voice)

    row.processed_at = m.utc_now()
    record_decision(
        session, organisation_id, DecisionType.SAFETY_ACTION,
        f"Safety event {event.event_type}: " + "; ".join(result.actions),
        input_snapshot={"event_type": event.event_type, "driver_id": event.driver_id,
                        "route_id": event.route_id, "severity": event.severity},
        decision_result={
            "actions": result.actions,
            "driver_safety_status": result.driver_safety_status,
            "route_status": result.route_status,
            "returned_order_ids": result.returned_order_ids,
            "reoptimisation_required": result.reoptimisation_required,
        },
    )
    logger.info("safety event processed",
                extra=log_ctx(event_type=str(event.event_type), actions=result.actions))
    return result


# --- handlers ----------------------------------------------------------------


def _handle_fatigue(session, org_id, event, policy: SafetyPolicy, result, notifier, voice) -> None:
    driver = _driver(session, org_id, event.driver_id)
    if driver is None:
        result.actions.append("No driver attached; event recorded only.")
        return

    _notify_driver(notifier, result, driver.id, "Fatigue warning",
                   "Fatigue detected. Please assess whether you need a break.")

    recent = _recent_event_count(session, org_id, driver.id, {EventType.FATIGUE_WARNING},
                                 minutes=8 * 60)
    if recent >= policy.fatigue_warnings_before_break:
        driver.safety_status = SafetyStatus.BREAK_REQUIRED
        result.actions.append(
            f"{recent} fatigue warnings within the shift — a "
            f"{policy.break_duration_minutes}-minute break is required."
        )
        result.reoptimisation_required = event.route_id is not None
        result.reoptimisation_route_id = event.route_id
    else:
        driver.safety_status = SafetyStatus.WARNING
        result.actions.append("Driver warned; safety status set to 'warning'.")
    DriverRepo.save(session, driver)
    result.driver_safety_status = driver.safety_status
    _notify_admin(notifier, result, org_id, "Driver fatigue",
                  f"Driver {driver.name} reported fatigue (warning {recent}).")


def _handle_break_required(session, org_id, event, policy, result, notifier, voice) -> None:
    driver = _driver(session, org_id, event.driver_id)
    if driver is None:
        result.actions.append("No driver attached; event recorded only.")
        return
    driver.safety_status = SafetyStatus.BREAK_REQUIRED
    DriverRepo.save(session, driver)
    result.driver_safety_status = driver.safety_status
    result.actions.append(f"Break of {policy.break_duration_minutes} minutes required.")
    result.reoptimisation_required = event.route_id is not None
    result.reoptimisation_route_id = event.route_id
    _notify_driver(notifier, result, driver.id, "Break required",
                   f"Please take a {policy.break_duration_minutes}-minute break now.")
    _notify_admin(notifier, result, org_id, "Driver break required",
                  f"Driver {driver.name} must take a break; route estimates need updating.")


def _handle_possible_accident(session, org_id, event, policy: SafetyPolicy, result,
                              notifier, voice) -> None:
    signals = _recent_event_count(
        session, org_id, event.driver_id, _CORROBORATING,
        minutes=policy.accident_confirmation_window_minutes,
    )
    if signals >= policy.accident_confirmation_signals:
        result.actions.append(
            f"{signals} corroborating signals within "
            f"{policy.accident_confirmation_window_minutes} minutes — treating as confirmed."
        )
        _handle_confirmed_accident(session, org_id, event, policy, result, notifier, voice)
        return

    # Single weak signal: hold, verify, never escalate to emergency services.
    route = _route(session, event.route_id)
    if route is not None and route.status in (RouteStatus.ACTIVE, RouteStatus.PLANNED):
        route.status = RouteStatus.SAFETY_HOLD
        PlanRepo.save_route(session, route)
        result.route_status = route.status
        result.actions.append("Route placed on safety hold pending confirmation.")
    result.actions.append(
        f"Signal {signals} of {policy.accident_confirmation_signals} required for confirmation; "
        "attempting driver confirmation."
    )
    if event.driver_id:
        _notify_driver(notifier, result, event.driver_id, "Are you OK?",
                       "Unusual movement detected. Please confirm you are safe.")
    _notify_admin(notifier, result, org_id, "Possible accident",
                  f"Possible accident for driver {event.driver_id}; confirmation requested.")


def _handle_confirmed_accident(session, org_id, event, policy: SafetyPolicy, result,
                               notifier, voice) -> None:
    driver = _driver(session, org_id, event.driver_id)
    if driver is not None:
        driver.safety_status = SafetyStatus.BLOCKED
        DriverRepo.save(session, driver)
        result.driver_safety_status = driver.safety_status
        result.actions.append("Driver blocked from receiving routes.")

    route = _route(session, event.route_id)
    if route is not None and route.status not in (RouteStatus.COMPLETED, RouteStatus.CANCELLED):
        route.status = RouteStatus.SUSPENDED
        PlanRepo.save_route(session, route)
        result.route_status = route.status
        result.actions.append("Route suspended.")
        # Incomplete orders return to dispatch for replacement capacity.
        for stop in PlanRepo.stops(session, route.id):
            if stop.status in (StopStatus.PENDING, StopStatus.ACTIVE):
                stop.status = StopStatus.RETURNED
                PlanRepo.save_stop(session, stop)
                order = OrderRepo.get(session, org_id, stop.order_id)
                if order is not None:
                    order.status = OrderStatus.RETURNED_TO_DISPATCH
                    OrderRepo.save(session, order)
                result.returned_order_ids.append(stop.order_id)
        if result.returned_order_ids:
            result.actions.append(
                f"{len(result.returned_order_ids)} incomplete order(s) returned to dispatch."
            )
            result.reoptimisation_required = True
            result.reoptimisation_route_id = route.id

    _notify_admin(notifier, result, org_id, "Accident confirmed",
                  f"Accident involving driver {event.driver_id}; route suspended, "
                  "replacement capacity required.")
    for contact in policy.escalation_contacts:
        _notify(notifier, result, "escalation_contact", contact, "Emergency escalation",
                f"Confirmed incident for driver {event.driver_id}.")
        if policy.voice_escalation_enabled:
            voice.place_call(contact, f"Confirmed incident for driver {event.driver_id}.")
            result.actions.append(f"Voice escalation call placed to {contact}.")


def _handle_device_offline(session, org_id, event, policy, result, notifier, voice) -> None:
    result.actions.append("Safety device offline; monitoring degraded.")
    _notify_admin(notifier, result, org_id, "Safety device offline",
                  f"Device {event.payload.get('device_id', 'unknown')} went offline "
                  f"(driver {event.driver_id}).")


# --- helpers -----------------------------------------------------------------


def _driver(session, org_id, driver_id):
    return DriverRepo.get(session, org_id, driver_id) if driver_id else None


def _route(session, route_id):
    if route_id is None:
        return None
    from aiviate.db.repo import to_domain

    row = session.get(t.RouteRow, route_id)
    return to_domain(row, m.Route) if row else None


def _recent_event_count(session, org_id, driver_id, event_types, minutes: int) -> int:
    if driver_id is None:
        return 1
    since = m.utc_now() - timedelta(minutes=minutes)
    rows = session.execute(
        select(t.OperationalEventRow.id).where(
            t.OperationalEventRow.organisation_id == org_id,
            t.OperationalEventRow.driver_id == driver_id,
            t.OperationalEventRow.event_type.in_([str(e) for e in event_types]),
            t.OperationalEventRow.occurred_at >= since,
        )
    ).all()
    return len(rows)


def _notify(notifier, result, recipient_type, recipient_id, subject, body) -> None:
    note = Notification(recipient_type=recipient_type, recipient_id=recipient_id,
                        subject=subject, body=body)
    notifier.send(note)
    result.notifications.append(note)


def _notify_driver(notifier, result, driver_id, subject, body) -> None:
    _notify(notifier, result, "driver", driver_id, subject, body)


def _notify_admin(notifier, result, org_id, subject, body) -> None:
    _notify(notifier, result, "administrator", org_id, subject, body)

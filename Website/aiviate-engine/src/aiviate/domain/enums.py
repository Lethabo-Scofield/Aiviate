"""Enumerations shared across the engine."""

from enum import StrEnum


class OrderPriority(StrEnum):
    LOW = "low"
    STANDARD = "standard"
    HIGH = "high"
    URGENT = "urgent"


class OrderStatus(StrEnum):
    RECEIVED = "received"
    INVALID = "invalid"
    PENDING_GEOCODE = "pending_geocode"
    GEOCODE_REVIEW = "geocode_review"
    READY = "ready"
    ASSIGNED = "assigned"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETURNED_TO_DISPATCH = "returned_to_dispatch"


class DriverStatus(StrEnum):
    AVAILABLE = "available"
    ON_ROUTE = "on_route"
    OFF_SHIFT = "off_shift"
    OFFLINE = "offline"
    SUSPENDED = "suspended"


class SafetyStatus(StrEnum):
    NORMAL = "normal"
    WARNING = "warning"
    BREAK_REQUIRED = "break_required"
    BLOCKED = "blocked"


class VehicleStatus(StrEnum):
    AVAILABLE = "available"
    IN_USE = "in_use"
    MAINTENANCE = "maintenance"
    BREAKDOWN = "breakdown"


class PlanStatus(StrEnum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    PUBLISHED = "published"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"
    FAILED = "failed"


class RouteStatus(StrEnum):
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    SAFETY_HOLD = "safety_hold"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class StopStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"  # driver en route to / at the stop
    COMPLETED = "completed"
    FAILED = "failed"
    RETURNED = "returned"  # sent back to dispatch pool


class EventType(StrEnum):
    # Safety events (emitted by the Aiviate Safety Device or drivers).
    FATIGUE_WARNING = "FATIGUE_WARNING"
    BREAK_REQUIRED = "BREAK_REQUIRED"
    DRIVER_UNRESPONSIVE = "DRIVER_UNRESPONSIVE"
    POSSIBLE_ACCIDENT = "POSSIBLE_ACCIDENT"
    ACCIDENT_CONFIRMED = "ACCIDENT_CONFIRMED"
    MANUAL_EMERGENCY = "MANUAL_EMERGENCY"
    DEVICE_OFFLINE = "DEVICE_OFFLINE"
    # Operational events.
    DRIVER_DELAY = "DRIVER_DELAY"
    VEHICLE_BREAKDOWN = "VEHICLE_BREAKDOWN"
    NEW_URGENT_ORDER = "NEW_URGENT_ORDER"
    ORDER_CANCELLED = "ORDER_CANCELLED"
    CUSTOMER_UNAVAILABLE = "CUSTOMER_UNAVAILABLE"
    DRIVER_SAFETY_BREAK = "DRIVER_SAFETY_BREAK"
    DRIVER_OFFLINE = "DRIVER_OFFLINE"
    ADMIN_REASSIGNMENT = "ADMIN_REASSIGNMENT"


SAFETY_EVENT_TYPES = frozenset(
    {
        EventType.FATIGUE_WARNING,
        EventType.BREAK_REQUIRED,
        EventType.DRIVER_UNRESPONSIVE,
        EventType.POSSIBLE_ACCIDENT,
        EventType.ACCIDENT_CONFIRMED,
        EventType.MANUAL_EMERGENCY,
        EventType.DEVICE_OFFLINE,
    }
)


class EventSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SolverStatus(StrEnum):
    OPTIMAL = "optimal"
    FEASIBLE = "feasible"
    INFEASIBLE = "infeasible"
    TIMEOUT = "timeout"
    ERROR = "error"


class DecisionType(StrEnum):
    PLAN_CREATED = "plan_created"
    PLAN_VALIDATED = "plan_validated"
    PLAN_PUBLISHED = "plan_published"
    PLAN_APPROVED = "plan_approved"
    PLAN_REJECTED = "plan_rejected"
    ASSIGNMENT = "assignment"
    REOPTIMISATION = "reoptimisation"
    SAFETY_ACTION = "safety_action"
    ADMIN_OVERRIDE = "admin_override"


class Role(StrEnum):
    ADMIN = "admin"
    DISPATCHER = "dispatcher"
    DRIVER = "driver"
    DEVICE = "device"

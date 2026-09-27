"""Organisation-configurable business rules.

The Business Rules Engine answers "what is allowed": objective weights,
thresholds, service areas, approval and safety policies. Rules are stored as a
JSON override document on ``Organisation.operating_rules`` and merged over the
defaults defined here, so nothing region-specific is hard-coded — the pilot
regions are pure configuration.

Every consumer records which rules it applied via ``applied_rule`` entries so
the audit trail can explain each decision.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator

from aiviate.domain.enums import OrderPriority
from aiviate.domain.geo import BoundingBox, Coordinate


class ObjectiveWeights(BaseModel):
    """Weights of the solver's minimisation objective ("what is optimal")."""

    travel_minute_cost: float = 1.0
    travel_km_cost: float = 0.35
    vehicle_operating_cost: float = 60.0  # fixed cost per used vehicle
    late_delivery_penalty_per_minute: float = 6.0
    unassigned_order_penalty: float = 2_000.0
    overtime_penalty_per_minute: float = 5.0
    route_imbalance_coefficient: float = 0.4  # global span cost on the time dimension
    reassignment_penalty: float = 45.0  # per order moved to a different driver on re-opt
    priority_multipliers: dict[OrderPriority, float] = Field(
        default_factory=lambda: {
            OrderPriority.LOW: 0.5,
            OrderPriority.STANDARD: 1.0,
            OrderPriority.HIGH: 3.0,
            OrderPriority.URGENT: 6.0,
        }
    )

    def priority_multiplier(self, priority: OrderPriority) -> float:
        return self.priority_multipliers.get(priority, 1.0)


class GeocodingRules(BaseModel):
    minimum_confidence: float = 0.85
    duplicate_location_precision: int = 5  # decimal places for duplicate detection
    service_area: BoundingBox | None = None


class ApprovalPolicy(BaseModel):
    auto_dispatch_enabled: bool = False
    auto_publish_threshold: float = 0.90
    approval_threshold: float = 0.70
    # A re-optimisation is "significant" (requires approval) beyond these:
    reopt_max_auto_delay_minutes: float = 20.0
    reopt_max_auto_reassigned_orders: int = 5


class SafetyPolicy(BaseModel):
    # Accidents must be confirmed by multiple signals or explicit confirmation.
    accident_confirmation_signals: int = 2
    accident_confirmation_window_minutes: int = 10
    fatigue_warnings_before_break: int = 2
    break_duration_minutes: int = 30
    escalation_contacts: list[str] = Field(default_factory=list)
    # Voice escalation (e.g. Retell AI) places calls only; it never decides
    # whether an accident occurred.
    voice_escalation_enabled: bool = False


class OperatingRules(BaseModel):
    weights: ObjectiveWeights = Field(default_factory=ObjectiveWeights)
    geocoding: GeocodingRules = Field(default_factory=GeocodingRules)
    approval: ApprovalPolicy = Field(default_factory=ApprovalPolicy)
    safety: SafetyPolicy = Field(default_factory=SafetyPolicy)

    supported_priorities: list[OrderPriority] = Field(
        default_factory=lambda: list(OrderPriority)
    )
    max_overtime_minutes: int = 60
    # Hard lateness bound past a delivery window's end. 0 = windows are strict.
    # When > 0, arrivals inside the grace incur the (priority-weighted)
    # late-delivery penalty and downgrade plan confidence.
    allowed_late_minutes: int = 0
    default_service_time_minutes: int = 5
    # Approved route start/end locations (depots). Routes must start and end here.
    depots: list[Coordinate] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_thresholds(self) -> "OperatingRules":
        if not 0.0 <= self.approval.approval_threshold <= self.approval.auto_publish_threshold <= 1.0:
            raise ValueError("approval thresholds must satisfy 0 <= approval <= auto_publish <= 1")
        if not 0.0 <= self.geocoding.minimum_confidence <= 1.0:
            raise ValueError("minimum_geocoding_confidence must be within [0, 1]")
        return self


def resolve_rules(operating_rules: dict[str, Any] | None) -> OperatingRules:
    """Merge an organisation's stored override document over the defaults."""
    return OperatingRules.model_validate(operating_rules or {})


def applied_rule(name: str, value: Any, source: str = "organisation") -> dict[str, Any]:
    """Standard audit record for a rule a module relied on."""
    return {"rule": name, "value": value, "source": source}

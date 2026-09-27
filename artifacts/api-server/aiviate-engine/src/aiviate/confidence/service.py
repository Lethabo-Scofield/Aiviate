"""Deterministic confidence scoring.

The score is a fixed-weight sum of independent components, each in [0, 1] and
each explainable on its own. No randomness, no model calls — identical inputs
always give identical scores. Decision levels come from the organisation's
approval policy:

    >= auto_publish_threshold  → publish automatically (if auto dispatch on)
    >= approval_threshold      → create, but require administrator approval
    otherwise                  → do not publish; request manual intervention
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field

from aiviate.domain.enums import SolverStatus
from aiviate.rules import ApprovalPolicy


class DecisionLevel(StrEnum):
    AUTO_PUBLISH = "auto_publish"
    REQUIRE_APPROVAL = "require_approval"
    MANUAL_INTERVENTION = "manual_intervention"


class ConfidenceInputs(BaseModel):
    order_geocode_confidences: list[float] = Field(default_factory=list)
    warning_count: int = 0
    max_weight_utilisation: float = 0.0  # max over routes, 0..1+
    max_volume_utilisation: float = 0.0
    max_shift_utilisation: float = 0.0
    mean_window_slack_fraction: float = 1.0  # 0 = every arrival at window edge
    assigned_order_count: int = 0
    unassigned_order_count: int = 0
    matrix_completeness: float = 1.0
    matrix_fallback_fraction: float = 0.0
    solver_status: SolverStatus = SolverStatus.OPTIMAL
    drivers_with_safety_warnings: int = 0
    drivers_total: int = 0


class ComponentScore(BaseModel):
    component: str
    value: float
    weight: float
    detail: str

    @property
    def weighted(self) -> float:
        return self.value * self.weight


class ConfidenceBreakdown(BaseModel):
    score: float
    level: DecisionLevel
    components: list[ComponentScore]

    def explanation_lines(self) -> list[str]:
        lines = [f"Plan confidence {self.score:.2f} → {self.level.value}."]
        lines += [
            f"- {c.component}: {c.value:.2f} (weight {c.weight:.2f}) — {c.detail}"
            for c in self.components
        ]
        return lines


_SOLVER_SCORES = {
    SolverStatus.OPTIMAL: 1.0,
    SolverStatus.FEASIBLE: 0.9,
    SolverStatus.TIMEOUT: 0.5,
    SolverStatus.INFEASIBLE: 0.0,
    SolverStatus.ERROR: 0.0,
}


def _tightness(utilisation: float, comfortable: float = 0.90) -> float:
    """1.0 while utilisation is comfortable, falling to 0 as it hits 100 %+."""
    if utilisation <= comfortable:
        return 1.0
    return max(0.0, 1.0 - (utilisation - comfortable) / (1.05 - comfortable))


def score_plan(inputs: ConfidenceInputs, policy: ApprovalPolicy) -> ConfidenceBreakdown:
    components: list[ComponentScore] = []

    def add(component: str, value: float, weight: float, detail: str) -> None:
        components.append(
            ComponentScore(component=component, value=max(0.0, min(1.0, value)),
                           weight=weight, detail=detail)
        )

    geocode = (
        sum(inputs.order_geocode_confidences) / len(inputs.order_geocode_confidences)
        if inputs.order_geocode_confidences
        else 1.0
    )
    add("geocoding_confidence", geocode, 0.15,
        f"mean geocoding confidence of {len(inputs.order_geocode_confidences)} assigned orders")

    add("warnings", 1.0 - min(1.0, inputs.warning_count * 0.10), 0.10,
        f"{inputs.warning_count} validation warning(s)")

    capacity = min(_tightness(inputs.max_weight_utilisation), _tightness(inputs.max_volume_utilisation))
    add("capacity_headroom", capacity, 0.10,
        f"max weight utilisation {inputs.max_weight_utilisation:.0%}, "
        f"volume {inputs.max_volume_utilisation:.0%}")

    add("shift_headroom", _tightness(inputs.max_shift_utilisation), 0.10,
        f"max shift utilisation {inputs.max_shift_utilisation:.0%}")

    add("window_slack", min(1.0, inputs.mean_window_slack_fraction * 2.0), 0.10,
        f"mean delivery-window slack {inputs.mean_window_slack_fraction:.0%}")

    total_orders = inputs.assigned_order_count + inputs.unassigned_order_count
    unassigned_fraction = inputs.unassigned_order_count / total_orders if total_orders else 0.0
    add("order_coverage", 1.0 - min(1.0, unassigned_fraction * 2.0), 0.15,
        f"{inputs.unassigned_order_count} of {total_orders} orders unassigned")

    add("matrix_completeness", inputs.matrix_completeness, 0.05,
        f"travel matrix {inputs.matrix_completeness:.0%} complete")

    add("road_data_quality", 1.0 - inputs.matrix_fallback_fraction, 0.10,
        f"{inputs.matrix_fallback_fraction:.0%} of matrix from straight-line fallback")

    add("solver_status", _SOLVER_SCORES.get(inputs.solver_status, 0.0), 0.10,
        f"solver finished with status '{inputs.solver_status}'")

    safety = 1.0
    if inputs.drivers_total:
        safety = 1.0 - (inputs.drivers_with_safety_warnings / inputs.drivers_total) * 0.5
    add("safety_restrictions", safety, 0.05,
        f"{inputs.drivers_with_safety_warnings} of {inputs.drivers_total} assigned drivers "
        "carry safety warnings")

    score = round(sum(c.weighted for c in components), 4)

    if inputs.solver_status in (SolverStatus.INFEASIBLE, SolverStatus.ERROR):
        level = DecisionLevel.MANUAL_INTERVENTION  # never publish a failed solve
    elif score >= policy.auto_publish_threshold:
        level = DecisionLevel.AUTO_PUBLISH
    elif score >= policy.approval_threshold:
        level = DecisionLevel.REQUIRE_APPROVAL
    else:
        level = DecisionLevel.MANUAL_INTERVENTION

    return ConfidenceBreakdown(score=score, level=level, components=components)

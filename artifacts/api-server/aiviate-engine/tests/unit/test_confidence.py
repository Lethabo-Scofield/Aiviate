from aiviate.confidence import ConfidenceInputs, DecisionLevel, score_plan
from aiviate.domain.enums import SolverStatus
from aiviate.rules import ApprovalPolicy

POLICY = ApprovalPolicy()


def good_inputs(**overrides) -> ConfidenceInputs:
    defaults = dict(
        order_geocode_confidences=[0.95, 0.97, 0.99],
        warning_count=0,
        max_weight_utilisation=0.6,
        max_volume_utilisation=0.5,
        max_shift_utilisation=0.7,
        mean_window_slack_fraction=0.5,
        assigned_order_count=30,
        unassigned_order_count=0,
        matrix_completeness=1.0,
        matrix_fallback_fraction=0.0,
        solver_status=SolverStatus.OPTIMAL,
        drivers_with_safety_warnings=0,
        drivers_total=3,
    )
    defaults.update(overrides)
    return ConfidenceInputs(**defaults)


def test_clean_plan_scores_auto_publish():
    result = score_plan(good_inputs(), POLICY)
    assert result.score >= 0.90
    assert result.level == DecisionLevel.AUTO_PUBLISH


def test_deterministic():
    a = score_plan(good_inputs(), POLICY)
    b = score_plan(good_inputs(), POLICY)
    assert a.score == b.score
    assert [c.value for c in a.components] == [c.value for c in b.components]


def test_unassigned_orders_pull_score_down():
    degraded = score_plan(good_inputs(assigned_order_count=20, unassigned_order_count=10), POLICY)
    clean = score_plan(good_inputs(), POLICY)
    assert degraded.score < clean.score
    assert degraded.level != DecisionLevel.AUTO_PUBLISH


def test_fallback_matrix_downgrades_to_approval():
    result = score_plan(good_inputs(matrix_fallback_fraction=1.0), POLICY)
    assert result.level == DecisionLevel.REQUIRE_APPROVAL


def test_failed_solver_forces_manual_intervention_regardless_of_score():
    result = score_plan(good_inputs(solver_status=SolverStatus.INFEASIBLE), POLICY)
    assert result.level == DecisionLevel.MANUAL_INTERVENTION


def test_many_problems_fall_below_approval_threshold():
    result = score_plan(
        good_inputs(
            order_geocode_confidences=[0.5, 0.6],
            warning_count=8,
            max_weight_utilisation=1.0,
            max_shift_utilisation=1.02,
            mean_window_slack_fraction=0.02,
            assigned_order_count=10,
            unassigned_order_count=12,
            matrix_completeness=0.7,
            matrix_fallback_fraction=1.0,
            solver_status=SolverStatus.TIMEOUT,
            drivers_with_safety_warnings=2,
            drivers_total=3,
        ),
        POLICY,
    )
    assert result.score < 0.70
    assert result.level == DecisionLevel.MANUAL_INTERVENTION


def test_breakdown_is_explainable():
    result = score_plan(good_inputs(), POLICY)
    lines = result.explanation_lines()
    assert any("geocoding_confidence" in line for line in lines)
    assert any("solver_status" in line for line in lines)
    # Weights sum to 1 so the score is a true weighted mean.
    assert abs(sum(c.weight for c in result.components) - 1.0) < 1e-9

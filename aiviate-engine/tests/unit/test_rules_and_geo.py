import pytest

from aiviate.domain.enums import OrderPriority
from aiviate.domain.geo import BoundingBox, Coordinate, haversine_km
from aiviate.rules import resolve_rules


def test_defaults_resolve_without_overrides():
    rules = resolve_rules(None)
    assert rules.geocoding.minimum_confidence == 0.85
    assert rules.approval.auto_publish_threshold == 0.90
    assert rules.approval.approval_threshold == 0.70
    assert rules.weights.unassigned_order_penalty > 0


def test_overrides_merge_over_defaults():
    rules = resolve_rules(
        {
            "geocoding": {"minimum_confidence": 0.9},
            "weights": {"reassignment_penalty": 99.0},
        }
    )
    assert rules.geocoding.minimum_confidence == 0.9
    assert rules.weights.reassignment_penalty == 99.0
    # Untouched defaults survive.
    assert rules.approval.auto_publish_threshold == 0.90


def test_invalid_threshold_ordering_rejected():
    with pytest.raises(ValueError):
        resolve_rules({"approval": {"approval_threshold": 0.95, "auto_publish_threshold": 0.8}})


def test_priority_multiplier_defaults():
    rules = resolve_rules(None)
    assert rules.weights.priority_multiplier(OrderPriority.URGENT) > rules.weights.priority_multiplier(
        OrderPriority.STANDARD
    )


def test_haversine_known_distance():
    joburg = Coordinate(latitude=-26.2041, longitude=28.0473)
    pretoria = Coordinate(latitude=-25.7479, longitude=28.2293)
    distance = haversine_km(joburg, pretoria)
    assert 50 < distance < 56  # ~53 km straight line


def test_bounding_box_contains():
    box = BoundingBox(min_latitude=-27, max_latitude=-25, min_longitude=27, max_longitude=29)
    assert box.contains(Coordinate(latitude=-26.2, longitude=28.0))
    assert not box.contains(Coordinate(latitude=-33.9, longitude=18.4))


def test_coordinate_rejects_out_of_range():
    with pytest.raises(ValueError):
        Coordinate(latitude=91.0, longitude=0.0)

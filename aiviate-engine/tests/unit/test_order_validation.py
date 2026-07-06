from datetime import datetime

import pytest

from aiviate.rules import resolve_rules
from aiviate.validation import validate_order
from tests.conftest import pilot_rules_doc

ORG = "org-1"


@pytest.fixture()
def rules():
    return resolve_rules(pilot_rules_doc())


def base_payload(**overrides) -> dict:
    payload = {
        "external_order_id": "ORD-001",
        "customer_name": "Thandi M",
        "raw_address": "12 Vilakazi Street, Orlando West",
        "package_weight": 12.5,
        "package_volume": 0.1,
        "priority": "standard",
        "delivery_window_start": datetime(2026, 7, 6, 8, 0),
        "delivery_window_end": datetime(2026, 7, 6, 16, 0),
    }
    payload.update(overrides)
    return payload


def codes(result) -> set[str]:
    return {e.code for e in result.errors}


def test_valid_order_passes(rules):
    result = validate_order(base_payload(), rules, ORG)
    assert result.is_valid
    assert result.status == "valid"


def test_missing_required_fields(rules):
    result = validate_order({"external_order_id": "ORD-002"}, rules, ORG)
    assert not result.is_valid
    assert "MISSING_FIELD" in codes(result)


def test_duplicate_external_id(rules):
    result = validate_order(base_payload(), rules, ORG, known_external_ids={"ORD-001"})
    assert "DUPLICATE_EXTERNAL_ID" in codes(result)


def test_non_positive_weight_and_volume(rules):
    result = validate_order(base_payload(package_weight=0, package_volume=-1), rules, ORG)
    assert {"NON_POSITIVE_WEIGHT", "NON_POSITIVE_VOLUME"} <= codes(result)


def test_window_end_before_start(rules):
    result = validate_order(
        base_payload(
            delivery_window_start=datetime(2026, 7, 6, 16, 0),
            delivery_window_end=datetime(2026, 7, 6, 8, 0),
        ),
        rules,
        ORG,
    )
    assert "WINDOW_END_BEFORE_START" in codes(result)
    error = next(e for e in result.errors if e.code == "WINDOW_END_BEFORE_START")
    assert error.field == "delivery_window_end"


def test_unsupported_priority(rules):
    result = validate_order(base_payload(priority="hyperspeed"), rules, ORG)
    assert "UNSUPPORTED_PRIORITY" in codes(result)


def test_invalid_coordinates(rules):
    result = validate_order(base_payload(latitude=123.0, longitude=500.0), rules, ORG)
    assert "INVALID_COORDINATES" in codes(result)


def test_outside_delivery_area(rules):
    # Cape Town coordinates, outside the pilot bounding box.
    result = validate_order(base_payload(latitude=-33.92, longitude=18.42), rules, ORG)
    assert "OUTSIDE_DELIVERY_AREA" in codes(result)


def test_organisation_mismatch(rules):
    result = validate_order(base_payload(organisation_id="other-org"), rules, ORG)
    assert "ORGANISATION_MISMATCH" in codes(result)


def test_in_area_coordinates_accepted(rules):
    result = validate_order(base_payload(latitude=-26.2, longitude=28.0), rules, ORG)
    assert result.is_valid

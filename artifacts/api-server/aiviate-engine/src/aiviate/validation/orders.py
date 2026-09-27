"""Deterministic order validation.

An order failing any check is marked invalid and never reaches optimisation.
Errors are structured (field / code / message) so the Admin UI and audit trail
can present them without parsing prose.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from aiviate.domain.enums import OrderPriority, OrderStatus
from aiviate.domain.geo import Coordinate
from aiviate.domain.models import Order
from aiviate.observability import get_logger
from aiviate.rules import OperatingRules

logger = get_logger(__name__)

REQUIRED_FIELDS = (
    "external_order_id",
    "customer_name",
    "raw_address",
    "package_weight",
    "package_volume",
    "delivery_window_start",
    "delivery_window_end",
)


class OrderValidationError(BaseModel):
    field: str
    code: str
    message: str


class OrderValidationResult(BaseModel):
    order_id: str | None = None
    external_order_id: str | None = None
    status: str = "valid"
    errors: list[OrderValidationError] = Field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.errors

    def add(self, field: str, code: str, message: str) -> None:
        self.status = "invalid"
        self.errors.append(OrderValidationError(field=field, code=code, message=message))


def validate_order(
    payload: dict[str, Any],
    rules: OperatingRules,
    organisation_id: str,
    known_external_ids: set[str] | None = None,
) -> OrderValidationResult:
    """Validate a raw order payload against structural and business rules.

    ``known_external_ids`` are external IDs already stored (or seen earlier in
    the same import batch) for this organisation; a repeat is a duplicate.
    """
    result = OrderValidationResult(
        order_id=payload.get("id"),
        external_order_id=payload.get("external_order_id"),
    )

    for field in REQUIRED_FIELDS:
        value = payload.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            result.add(field, "MISSING_FIELD", f"Field '{field}' is required.")
    if result.errors:
        return result

    org_id = payload.get("organisation_id")
    if org_id is not None and org_id != organisation_id:
        result.add(
            "organisation_id",
            "ORGANISATION_MISMATCH",
            "Order does not belong to the requesting organisation.",
        )
        return result

    if known_external_ids and payload["external_order_id"] in known_external_ids:
        result.add(
            "external_order_id",
            "DUPLICATE_EXTERNAL_ID",
            f"External order ID '{payload['external_order_id']}' already exists.",
        )

    def _positive(field: str, code: str) -> None:
        try:
            value = float(payload[field])
        except (TypeError, ValueError):
            result.add(field, code, f"Field '{field}' must be a positive number.")
            return
        if value <= 0:
            result.add(field, code, f"Field '{field}' must be greater than zero.")

    _positive("package_weight", "NON_POSITIVE_WEIGHT")
    _positive("package_volume", "NON_POSITIVE_VOLUME")

    # Delivery window: parse through the domain model for consistent tz handling.
    try:
        probe = Order.model_validate(
            {**payload, "organisation_id": organisation_id, "priority": "standard"}
        )
    except Exception:
        probe = None
        result.add("delivery_window_start", "INVALID_WINDOW", "Delivery window fields must be valid timestamps.")

    if probe is not None:
        if probe.delivery_window_end <= probe.delivery_window_start:
            result.add(
                "delivery_window_end",
                "WINDOW_END_BEFORE_START",
                "Delivery window end must be later than its start.",
            )
        if probe.service_time_minutes < 0:
            result.add("service_time_minutes", "NEGATIVE_SERVICE_TIME", "Service time cannot be negative.")

    priority = payload.get("priority", OrderPriority.STANDARD)
    try:
        priority = OrderPriority(priority)
    except ValueError:
        result.add("priority", "UNSUPPORTED_PRIORITY", f"Priority '{priority}' is not supported.")
        priority = None
    if priority is not None and priority not in rules.supported_priorities:
        result.add(
            "priority",
            "UNSUPPORTED_PRIORITY",
            f"Priority '{priority}' is not enabled for this organisation.",
        )

    latitude, longitude = payload.get("latitude"), payload.get("longitude")
    if latitude is not None or longitude is not None:
        point: Coordinate | None = None
        if latitude is None or longitude is None:
            result.add("latitude", "INVALID_COORDINATES", "Latitude and longitude must be provided together.")
        else:
            try:
                point = Coordinate(latitude=float(latitude), longitude=float(longitude))
            except (TypeError, ValueError):
                result.add("latitude", "INVALID_COORDINATES", "Latitude/longitude pair is not valid.")
        if point is not None and rules.geocoding.service_area is not None:
            if not rules.geocoding.service_area.contains(point):
                result.add(
                    "latitude",
                    "OUTSIDE_DELIVERY_AREA",
                    "Coordinates fall outside the organisation's configured delivery area.",
                )

    if not result.is_valid:
        logger.info(
            "order validation failed",
            extra={"ctx": {"external_order_id": result.external_order_id,
                           "codes": [e.code for e in result.errors]}},
        )
    return result


def status_after_validation(result: OrderValidationResult) -> OrderStatus:
    return OrderStatus.RECEIVED if result.is_valid else OrderStatus.INVALID

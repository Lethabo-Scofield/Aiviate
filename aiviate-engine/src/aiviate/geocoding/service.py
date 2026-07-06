"""Geocoding service: normalisation, caching, confidence gating, duplicates,
service-area checks and the administrator review queue.

Low-confidence results never flow into automatic dispatch: the order is
marked ``geocode_review`` and an AddressReview row is queued instead.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from aiviate.db import tables as t
from aiviate.domain.enums import OrderStatus
from aiviate.domain.geo import Coordinate
from aiviate.domain.models import Order
from aiviate.geocoding.provider import GeocodeResult, GeocodingError, GeocodingProvider
from aiviate.observability import get_logger, log_ctx, metrics
from aiviate.rules import OperatingRules, applied_rule

logger = get_logger(__name__)

_ABBREVIATIONS = {
    r"\bstr\.?\b": "street",
    r"\brd\.?\b": "road",
    r"\bave?\.?\b": "avenue",
    r"\bdr\.?\b": "drive",
    r"\bblvd\.?\b": "boulevard",
    r"\bext\.?\b": "extension",
}


def normalise_address(raw: str) -> str:
    text = raw.strip().lower()
    text = re.sub(r"[^\w\s,/-]", "", text)
    for pattern, replacement in _ABBREVIATIONS.items():
        text = re.sub(pattern, replacement, text)
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class GeocodeOutcome:
    order_id: str
    status: OrderStatus
    result: GeocodeResult | None = None
    duplicate_of_order_ids: list[str] = field(default_factory=list)
    review_reason: str | None = None
    rules_applied: list[dict[str, Any]] = field(default_factory=list)
    from_cache: bool = False


class GeocodingService:
    def __init__(self, provider: GeocodingProvider) -> None:
        self._provider = provider

    def geocode_order(
        self,
        session: Session,
        order: Order,
        rules: OperatingRules,
    ) -> GeocodeOutcome:
        """Geocode one order in place (mutates and returns outcome; caller persists)."""
        normalised = normalise_address(order.raw_address)
        order.normalised_address = normalised

        result, from_cache = self._lookup(session, normalised)
        if result is None:
            metrics.increment("geocoding.failures")
            logger.warning("geocoding failed", extra=log_ctx(order_id=order.id))
            order.status = OrderStatus.GEOCODE_REVIEW
            self._queue_review(session, order, None, "PROVIDER_FAILURE")
            return GeocodeOutcome(
                order_id=order.id, status=order.status, review_reason="PROVIDER_FAILURE"
            )

        order.latitude = result.latitude
        order.longitude = result.longitude
        order.geocoding_confidence = result.confidence

        outcome = GeocodeOutcome(
            order_id=order.id, status=OrderStatus.READY, result=result, from_cache=from_cache
        )
        outcome.rules_applied.append(
            applied_rule("minimum_geocoding_confidence", rules.geocoding.minimum_confidence)
        )

        point = Coordinate(latitude=result.latitude, longitude=result.longitude)
        area = rules.geocoding.service_area
        if area is not None and not area.contains(point):
            order.status = OrderStatus.GEOCODE_REVIEW
            outcome.status = order.status
            outcome.review_reason = "OUTSIDE_SERVICE_AREA"
            self._queue_review(session, order, result, "OUTSIDE_SERVICE_AREA")
            return outcome

        if result.confidence < rules.geocoding.minimum_confidence:
            order.status = OrderStatus.GEOCODE_REVIEW
            outcome.status = order.status
            outcome.review_reason = "LOW_CONFIDENCE"
            self._queue_review(session, order, result, "LOW_CONFIDENCE")
            metrics.increment("geocoding.low_confidence")
            return outcome

        outcome.duplicate_of_order_ids = self._find_duplicates(session, order, rules)
        order.status = OrderStatus.READY
        return outcome

    def _lookup(self, session: Session, normalised: str) -> tuple[GeocodeResult | None, bool]:
        cached = session.execute(
            select(t.GeocodeCacheRow).where(
                t.GeocodeCacheRow.provider == self._provider.name,
                t.GeocodeCacheRow.normalised_address == normalised,
            )
        ).scalar_one_or_none()
        if cached is not None:
            metrics.increment("geocoding.cache_hits")
            return (
                GeocodeResult(
                    latitude=cached.latitude,
                    longitude=cached.longitude,
                    confidence=cached.confidence,
                    provider=cached.provider,
                    metadata=cached.provider_metadata or {},
                ),
                True,
            )
        try:
            result = self._provider.geocode(normalised)
        except GeocodingError:
            return None, False
        session.add(
            t.GeocodeCacheRow(
                provider=result.provider,
                normalised_address=normalised,
                latitude=result.latitude,
                longitude=result.longitude,
                confidence=result.confidence,
                provider_metadata=result.metadata,
            )
        )
        return result, False

    def _find_duplicates(self, session: Session, order: Order, rules: OperatingRules) -> list[str]:
        """Other open orders of the same organisation at the same rounded location."""
        precision = rules.geocoding.duplicate_location_precision
        assert order.latitude is not None and order.longitude is not None
        key = Coordinate(latitude=order.latitude, longitude=order.longitude).key(precision)
        candidates = session.execute(
            select(t.OrderRow.id, t.OrderRow.latitude, t.OrderRow.longitude).where(
                t.OrderRow.organisation_id == order.organisation_id,
                t.OrderRow.id != order.id,
                t.OrderRow.latitude.is_not(None),
                t.OrderRow.status.in_(["received", "ready", "assigned"]),
            )
        ).all()
        duplicates = [
            row.id
            for row in candidates
            if Coordinate(latitude=row.latitude, longitude=row.longitude).key(precision) == key
        ]
        if duplicates:
            logger.info(
                "duplicate location detected",
                extra=log_ctx(order_id=order.id, duplicates=duplicates),
            )
        return duplicates

    def _queue_review(
        self, session: Session, order: Order, result: GeocodeResult | None, reason: str
    ) -> None:
        session.add(
            t.AddressReviewRow(
                organisation_id=order.organisation_id,
                order_id=order.id,
                normalised_address=order.normalised_address or "",
                latitude=result.latitude if result else None,
                longitude=result.longitude if result else None,
                confidence=result.confidence if result else None,
                reason=reason,
            )
        )

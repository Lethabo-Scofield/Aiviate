from sqlalchemy import select

from aiviate.db import tables as t
from aiviate.domain.enums import OrderStatus
from aiviate.domain.geo import BoundingBox
from aiviate.geocoding import GeocodeResult, GeocodingService, normalise_address
from aiviate.geocoding.local import LocalGeocodingProvider
from tests.conftest import PILOT_SERVICE_AREA, make_order


def area() -> BoundingBox:
    return BoundingBox(**PILOT_SERVICE_AREA)


def provider_with(address: str, lat: float, lon: float, confidence: float) -> LocalGeocodingProvider:
    provider = LocalGeocodingProvider(area())
    provider.register(
        address,
        GeocodeResult(latitude=lat, longitude=lon, confidence=confidence, provider="local"),
    )
    return provider


def test_normalise_address():
    assert normalise_address("  12 Vilakazi Str,  Orlando  West! ") == "12 vilakazi street, orlando west"
    assert normalise_address("5 Church Rd.") == "5 church road"


def test_high_confidence_address_becomes_ready(session, organisation, rules):
    order = make_order(organisation.id, "ORD-G1", 0, 0, status="received",
                       raw_address="12 Vilakazi Str, Orlando West")
    provider = provider_with("12 vilakazi street, orlando west", -26.238, 27.909, 0.96)
    outcome = GeocodingService(provider).geocode_order(session, order, rules)

    assert outcome.status == OrderStatus.READY
    assert order.latitude == -26.238
    assert order.geocoding_confidence == 0.96


def test_low_confidence_goes_to_review_not_dispatch(session, organisation, rules):
    order = make_order(organisation.id, "ORD-G2", 0, 0, status="received",
                       raw_address="Somewhere vague")
    provider = provider_with("somewhere vague", -26.2, 28.0, 0.55)
    outcome = GeocodingService(provider).geocode_order(session, order, rules)

    assert outcome.status == OrderStatus.GEOCODE_REVIEW
    assert outcome.review_reason == "LOW_CONFIDENCE"
    reviews = session.execute(select(t.AddressReviewRow)).scalars().all()
    assert len(reviews) == 1 and reviews[0].reason == "LOW_CONFIDENCE"


def test_unknown_address_synthesises_low_confidence(session, organisation, rules):
    order = make_order(organisation.id, "ORD-G3", 0, 0, status="received",
                       raw_address="Unregistered place 42")
    outcome = GeocodingService(LocalGeocodingProvider(area())).geocode_order(session, order, rules)
    # Deterministic synthetic coordinates carry low confidence → review queue.
    assert outcome.status == OrderStatus.GEOCODE_REVIEW


def test_outside_service_area_flagged(session, organisation, rules):
    order = make_order(organisation.id, "ORD-G4", 0, 0, status="received",
                       raw_address="1 Long Street Cape Town")
    provider = provider_with("1 long street cape town", -33.92, 18.42, 0.97)
    outcome = GeocodingService(provider).geocode_order(session, order, rules)
    assert outcome.review_reason == "OUTSIDE_SERVICE_AREA"


def test_results_are_cached(session, organisation, rules):
    provider = provider_with("12 vilakazi street, orlando west", -26.238, 27.909, 0.96)
    service = GeocodingService(provider)
    first = make_order(organisation.id, "ORD-G5", 0, 0, status="received",
                       raw_address="12 Vilakazi Street, Orlando West")
    service.geocode_order(session, first, rules)
    session.commit()

    # Same address again — served from cache even with an empty provider book.
    second = make_order(organisation.id, "ORD-G6", 0, 0, status="received",
                        raw_address="12 Vilakazi Str, Orlando West")
    outcome = GeocodingService(LocalGeocodingProvider(area())).geocode_order(session, second, rules)
    # Note: cache is per-provider; use the same provider name ("local") so it hits.
    assert outcome.from_cache
    assert second.latitude == -26.238


def test_duplicate_locations_detected(session, organisation, rules):
    provider = provider_with("12 vilakazi street, orlando west", -26.238, 27.909, 0.96)
    service = GeocodingService(provider)
    first = make_order(organisation.id, "ORD-G7", 0, 0, status="received",
                       raw_address="12 Vilakazi Street, Orlando West")
    service.geocode_order(session, first, rules)
    from aiviate.db.repo import OrderRepo

    OrderRepo.save(session, first)
    session.commit()

    second = make_order(organisation.id, "ORD-G8", 0, 0, status="received",
                        raw_address="12 Vilakazi Str, Orlando West")
    outcome = service.geocode_order(session, second, rules)
    assert first.id in outcome.duplicate_of_order_ids

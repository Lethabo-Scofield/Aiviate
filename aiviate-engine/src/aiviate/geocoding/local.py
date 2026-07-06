"""Deterministic local geocoding adapter.

Credential-free stand-in for a real provider (Google, Nominatim, ...):

* Addresses registered in its fixture book resolve exactly with the fixture's
  confidence — simulations and tests control outcomes precisely.
* Unknown addresses hash deterministically to a coordinate inside the
  configured area with *low* confidence (0.40), so unrecognised addresses are
  routed to administrator review instead of silently entering dispatch.

Swap in a real provider via AIVIATE_GEOCODING_PROVIDER; see README
("Geocoding providers") for integration instructions.
"""

from __future__ import annotations

import hashlib

from aiviate.domain.geo import BoundingBox
from aiviate.geocoding.provider import GeocodeResult

UNKNOWN_ADDRESS_CONFIDENCE = 0.40


class LocalGeocodingProvider:
    name = "local"

    def __init__(self, area: BoundingBox, fixtures: dict[str, GeocodeResult] | None = None) -> None:
        self._area = area
        self._fixtures = dict(fixtures or {})

    def register(self, normalised_address: str, result: GeocodeResult) -> None:
        self._fixtures[normalised_address] = result

    def geocode(self, normalised_address: str) -> GeocodeResult:
        fixture = self._fixtures.get(normalised_address)
        if fixture is not None:
            return fixture

        digest = hashlib.sha256(normalised_address.encode("utf-8")).digest()
        lat_frac = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF
        lon_frac = int.from_bytes(digest[4:8], "big") / 0xFFFFFFFF
        return GeocodeResult(
            latitude=self._area.min_latitude
            + lat_frac * (self._area.max_latitude - self._area.min_latitude),
            longitude=self._area.min_longitude
            + lon_frac * (self._area.max_longitude - self._area.min_longitude),
            confidence=UNKNOWN_ADDRESS_CONFIDENCE,
            provider=self.name,
            metadata={"synthetic": True},
        )

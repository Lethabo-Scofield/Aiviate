"""Geocoding provider interface. Providers are swappable via configuration."""

from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel, Field


class GeocodeResult(BaseModel):
    latitude: float
    longitude: float
    confidence: float = Field(ge=0.0, le=1.0)
    provider: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class GeocodingError(Exception):
    """Raised when a provider cannot geocode an address (network, quota, no match)."""


class GeocodingProvider(Protocol):
    name: str

    def geocode(self, normalised_address: str) -> GeocodeResult:
        """Resolve one normalised address. Raises GeocodingError on failure."""
        ...

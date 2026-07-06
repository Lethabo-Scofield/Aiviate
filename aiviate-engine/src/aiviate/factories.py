"""Provider factories: settings → concrete geocoding/matrix services."""

from __future__ import annotations

from aiviate.config import Settings
from aiviate.domain.geo import BoundingBox
from aiviate.geocoding import GeocodingService
from aiviate.geocoding.local import LocalGeocodingProvider
from aiviate.matrix import MatrixService
from aiviate.matrix.haversine import HaversineFallbackProvider
from aiviate.matrix.osrm import OsrmMatrixProvider

# Generous default synthesis area for the credential-free local geocoder when
# an organisation has no service area configured (southern Africa).
_DEFAULT_AREA = BoundingBox(
    min_latitude=-35.0, max_latitude=-22.0, min_longitude=16.0, max_longitude=33.0
)


def build_geocoding_service(settings: Settings, area: BoundingBox | None = None) -> GeocodingService:
    if settings.geocoding_provider == "local":
        return GeocodingService(LocalGeocodingProvider(area or _DEFAULT_AREA))
    raise ValueError(
        f"unknown geocoding provider '{settings.geocoding_provider}'. "
        "Implement a GeocodingProvider adapter and register it here — see README."
    )


def build_matrix_service(settings: Settings) -> MatrixService:
    fallback = HaversineFallbackProvider()
    if settings.matrix_provider == "osrm":
        primary = OsrmMatrixProvider(
            settings.osrm_base_url,
            timeout_seconds=settings.provider_timeout_seconds,
            max_retries=settings.provider_max_retries,
        )
        return MatrixService(primary, fallback=fallback,
                             coordinate_precision=settings.matrix_coordinate_precision)
    if settings.matrix_provider == "haversine":
        return MatrixService(fallback, coordinate_precision=settings.matrix_coordinate_precision)
    raise ValueError(
        f"unknown matrix provider '{settings.matrix_provider}'. "
        "Implement a MatrixProvider adapter and register it here — see README."
    )

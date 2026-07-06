"""Provider-independent geospatial primitives.

Haversine distance is a *fallback / clustering signal / test fixture* only —
final routing costs must come from a road matrix provider (see aiviate.matrix).
"""

from __future__ import annotations

import math

from pydantic import BaseModel, Field

EARTH_RADIUS_KM = 6371.0088


class Coordinate(BaseModel):
    model_config = {"frozen": True}

    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)

    def key(self, precision: int = 5) -> str:
        return f"{self.latitude:.{precision}f},{self.longitude:.{precision}f}"


class BoundingBox(BaseModel):
    """Axis-aligned service-area boundary, configured per organisation."""

    min_latitude: float = Field(ge=-90.0, le=90.0)
    max_latitude: float = Field(ge=-90.0, le=90.0)
    min_longitude: float = Field(ge=-180.0, le=180.0)
    max_longitude: float = Field(ge=-180.0, le=180.0)

    def contains(self, point: Coordinate) -> bool:
        return (
            self.min_latitude <= point.latitude <= self.max_latitude
            and self.min_longitude <= point.longitude <= self.max_longitude
        )


def haversine_km(a: Coordinate, b: Coordinate) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a.latitude, a.longitude, b.latitude, b.longitude))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))

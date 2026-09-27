"""Straight-line fallback matrix provider.

Explicitly NOT a road matrix: results are haversine distance scaled by a
road-circuity factor with an average urban speed. Every entry is flagged
``is_fallback=True`` — the confidence scorer penalises plans built on it and
it must never silently masquerade as road data. Use for tests, clustering
signals and graceful degradation when the road provider is down.
"""

from __future__ import annotations

from aiviate.domain.geo import Coordinate, haversine_km
from aiviate.matrix.provider import MatrixEntry, PartialMatrixResult

ROAD_CIRCUITY_FACTOR = 1.35
AVERAGE_SPEED_KMH = 40.0


class HaversineFallbackProvider:
    name = "haversine_fallback"
    is_fallback = True

    def __init__(
        self,
        circuity_factor: float = ROAD_CIRCUITY_FACTOR,
        average_speed_kmh: float = AVERAGE_SPEED_KMH,
    ) -> None:
        self._circuity = circuity_factor
        self._speed = average_speed_kmh

    def compute(self, points: list[Coordinate]) -> PartialMatrixResult:
        entries: list[list[MatrixEntry | None]] = []
        for origin in points:
            row: list[MatrixEntry | None] = []
            for destination in points:
                if origin == destination:
                    row.append(MatrixEntry(distance_m=0.0, duration_s=0.0, is_fallback=True))
                    continue
                road_km = haversine_km(origin, destination) * self._circuity
                row.append(
                    MatrixEntry(
                        distance_m=road_km * 1000.0,
                        duration_s=road_km / self._speed * 3600.0,
                        is_fallback=True,
                    )
                )
            entries.append(row)
        return PartialMatrixResult(entries=entries)

"""Matrix provider interface and result types.

The engine's routing cost must come from a road-network provider (OSRM,
Google, ...). Straight-line estimates are permitted only as an explicit
fallback / clustering signal / test fixture and always carry
``is_fallback=True`` so downstream confidence scoring can penalise them.
"""

from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel, Field

from aiviate.domain.geo import Coordinate


class MatrixEntry(BaseModel):
    distance_m: float
    duration_s: float
    geometry: dict[str, Any] | None = None
    is_fallback: bool = False


class TravelMatrix(BaseModel):
    """Dense travel matrix over an ordered list of points."""

    points: list[Coordinate]
    entries: list[list[MatrixEntry | None]]  # entries[i][j]: from points[i] to points[j]
    provider: str
    fallback_entry_count: int = 0
    missing_entry_count: int = 0

    @property
    def size(self) -> int:
        return len(self.points)

    @property
    def completeness(self) -> float:
        total = self.size * self.size
        return 1.0 if total == 0 else (total - self.missing_entry_count) / total

    @property
    def fallback_fraction(self) -> float:
        total = self.size * self.size
        return 0.0 if total == 0 else self.fallback_entry_count / total

    def duration_s(self, i: int, j: int) -> float:
        entry = self.entries[i][j]
        if entry is None:
            raise KeyError(f"matrix entry ({i},{j}) missing")
        return entry.duration_s

    def distance_m(self, i: int, j: int) -> float:
        entry = self.entries[i][j]
        if entry is None:
            raise KeyError(f"matrix entry ({i},{j}) missing")
        return entry.distance_m


class MatrixProviderError(Exception):
    """Provider-level failure (network, quota, malformed response)."""


class PartialMatrixResult(BaseModel):
    """Provider output; missing pairs are None (partial failures are allowed)."""

    entries: list[list[MatrixEntry | None]]


class MatrixProvider(Protocol):
    name: str
    is_fallback: bool

    def compute(self, points: list[Coordinate]) -> PartialMatrixResult:
        """Compute all-pairs travel costs. May return None entries on partial failure."""
        ...


class BatchLimits(BaseModel):
    max_points_per_request: int = Field(default=100, gt=1)

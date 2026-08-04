"""Matrix service: caching, primary/fallback orchestration, completeness tracking.

Cache entries are keyed by (provider, origin coordinate key, destination
coordinate key) so results are reusable across plans. When the primary road
provider fails for some pairs, the fallback provider fills the gaps and the
resulting matrix reports how much of it is fallback data — the confidence
scorer downgrades plans accordingly.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from aiviate.domain.geo import Coordinate
from aiviate.matrix.provider import MatrixEntry, MatrixProvider, TravelMatrix
from aiviate.observability import get_logger, log_ctx, metrics

logger = get_logger(__name__)


class MatrixService:
    def __init__(
        self,
        primary: MatrixProvider,
        fallback: MatrixProvider | None = None,
        coordinate_precision: int = 5,
    ) -> None:
        self._primary = primary
        self._fallback = fallback
        self._precision = coordinate_precision

    def build_matrix(self, session: Session, points: list[Coordinate]) -> TravelMatrix:
        from aiviate.db import tables as t

        n = len(points)
        keys = [p.key(self._precision) for p in points]
        entries: list[list[MatrixEntry | None]] = [[None] * n for _ in range(n)]

        # 1. Cache.
        cached = session.execute(
            select(t.MatrixCacheRow).where(
                t.MatrixCacheRow.provider == self._primary.name,
                t.MatrixCacheRow.origin_key.in_(keys),
                t.MatrixCacheRow.destination_key.in_(keys),
            )
        ).scalars()
        by_key = {(row.origin_key, row.destination_key): row for row in cached}
        index_of = {key: i for i, key in enumerate(keys)}
        cache_hits = 0
        for (origin_key, destination_key), row in by_key.items():
            i, j = index_of[origin_key], index_of[destination_key]
            entries[i][j] = MatrixEntry(
                distance_m=row.distance_m,
                duration_s=row.duration_s,
                geometry=row.geometry,
                is_fallback=row.is_fallback,
            )
            cache_hits += 1
        metrics.increment("matrix.cache_hits", cache_hits)

        # 2. Primary provider for anything missing.
        if any(entries[i][j] is None for i in range(n) for j in range(n)):
            with metrics.timer("matrix.primary_seconds"):
                try:
                    result = self._primary.compute(points)
                except Exception as exc:  # provider hard failure — fall back entirely
                    metrics.increment("matrix.provider_failures")
                    logger.error("primary matrix provider failed", extra=log_ctx(error=str(exc)))
                    result = None
            if result is not None:
                for i in range(n):
                    for j in range(n):
                        entry = result.entries[i][j]
                        if entries[i][j] is None and entry is not None:
                            entries[i][j] = entry
                            session.add(
                                t.MatrixCacheRow(
                                    provider=self._primary.name,
                                    origin_key=keys[i],
                                    destination_key=keys[j],
                                    distance_m=entry.distance_m,
                                    duration_s=entry.duration_s,
                                    geometry=entry.geometry,
                                    is_fallback=entry.is_fallback,
                                )
                            )

        # 3. Fallback fills remaining gaps (flagged, not cached as road data).
        missing = [(i, j) for i in range(n) for j in range(n) if entries[i][j] is None]
        if missing and self._fallback is not None:
            fallback_result = self._fallback.compute(points)
            for i, j in missing:
                entries[i][j] = fallback_result.entries[i][j]
            metrics.increment("matrix.fallback_entries", len(missing))

        fallback_count = sum(
            1 for row in entries for cell in row if cell is not None and cell.is_fallback
        )
        missing_count = sum(1 for i in range(n) for j in range(n) if entries[i][j] is None)
        if missing_count:
            metrics.increment("matrix.missing_entries", missing_count)

        return TravelMatrix(
            points=points,
            entries=entries,
            provider=self._primary.name,
            fallback_entry_count=fallback_count,
            missing_entry_count=missing_count,
        )

"""OSRM road-matrix adapter (HTTP /table service).

Point AIVIATE_OSRM_BASE_URL at any OSRM instance (self-hosted with the
south-africa-latest extract for the pilot). Handles chunking, retries with
backoff for rate limits, and partial failures (missing pairs come back as
None entries rather than failing the whole matrix).
"""

from __future__ import annotations

import time

import httpx

from aiviate.domain.geo import Coordinate
from aiviate.matrix.provider import (
    MatrixEntry,
    MatrixProviderError,
    PartialMatrixResult,
)
from aiviate.observability import get_logger, log_ctx, metrics

logger = get_logger(__name__)

RETRYABLE_STATUS = {429, 502, 503, 504}


class OsrmMatrixProvider:
    name = "osrm"
    is_fallback = False

    def __init__(
        self,
        base_url: str,
        timeout_seconds: float = 10.0,
        max_retries: int = 3,
        max_points_per_request: int = 100,
        client: httpx.Client | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds
        self._max_retries = max_retries
        self._chunk = max_points_per_request
        self._client = client or httpx.Client(timeout=timeout_seconds)

    def compute(self, points: list[Coordinate]) -> PartialMatrixResult:
        n = len(points)
        entries: list[list[MatrixEntry | None]] = [[None] * n for _ in range(n)]
        # OSRM /table accepts sources/destinations index subsets; chunk both axes.
        for src_start in range(0, n, self._chunk):
            src_idx = list(range(src_start, min(src_start + self._chunk, n)))
            for dst_start in range(0, n, self._chunk):
                dst_idx = list(range(dst_start, min(dst_start + self._chunk, n)))
                block = self._fetch_block(points, src_idx, dst_idx)
                if block is None:
                    continue  # partial failure: leave the block missing
                durations, distances = block
                for bi, i in enumerate(src_idx):
                    for bj, j in enumerate(dst_idx):
                        duration = durations[bi][bj]
                        distance = distances[bi][bj]
                        if duration is None or distance is None:
                            continue
                        entries[i][j] = MatrixEntry(distance_m=distance, duration_s=duration)
        return PartialMatrixResult(entries=entries)

    def _fetch_block(
        self, points: list[Coordinate], src_idx: list[int], dst_idx: list[int]
    ) -> tuple[list[list[float | None]], list[list[float | None]]] | None:
        involved = sorted(set(src_idx) | set(dst_idx))
        position = {point_index: pos for pos, point_index in enumerate(involved)}
        coords = ";".join(f"{points[i].longitude},{points[i].latitude}" for i in involved)
        url = f"{self._base_url}/table/v1/driving/{coords}"
        params = {
            "sources": ";".join(str(position[i]) for i in src_idx),
            "destinations": ";".join(str(position[j]) for j in dst_idx),
            "annotations": "duration,distance",
        }
        delay = 0.5
        for attempt in range(self._max_retries + 1):
            try:
                response = self._client.get(url, params=params)
            except httpx.HTTPError as exc:
                logger.warning("osrm request error", extra=log_ctx(error=str(exc), attempt=attempt))
                metrics.increment("matrix.provider_errors")
                if attempt == self._max_retries:
                    return None
                time.sleep(delay)
                delay *= 2
                continue
            if response.status_code in RETRYABLE_STATUS:
                metrics.increment("matrix.provider_rate_limited")
                if attempt == self._max_retries:
                    return None
                retry_after = response.headers.get("Retry-After")
                time.sleep(float(retry_after) if retry_after else delay)
                delay *= 2
                continue
            if response.status_code != 200:
                metrics.increment("matrix.provider_errors")
                raise MatrixProviderError(f"OSRM returned HTTP {response.status_code}")
            body = response.json()
            if body.get("code") != "Ok":
                metrics.increment("matrix.provider_errors")
                logger.warning("osrm error response", extra=log_ctx(code=body.get("code")))
                return None
            return body["durations"], body["distances"]
        return None

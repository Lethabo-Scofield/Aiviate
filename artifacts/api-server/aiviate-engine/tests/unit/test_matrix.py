import httpx
from sqlalchemy import func, select

from aiviate.db import tables as t
from aiviate.domain.geo import Coordinate
from aiviate.matrix import MatrixService
from aiviate.matrix.haversine import HaversineFallbackProvider
from aiviate.matrix.osrm import OsrmMatrixProvider
from aiviate.matrix.provider import PartialMatrixResult

JOBURG = Coordinate(latitude=-26.2041, longitude=28.0473)
SOWETO = Coordinate(latitude=-26.2678, longitude=27.8585)
PRETORIA = Coordinate(latitude=-25.7479, longitude=28.2293)


def test_haversine_provider_flags_fallback():
    result = HaversineFallbackProvider().compute([JOBURG, PRETORIA])
    entry = result.entries[0][1]
    assert entry.is_fallback
    assert entry.distance_m > 53_000  # circuity > straight line
    assert entry.duration_s > 0
    assert result.entries[0][0].duration_s == 0.0


def test_matrix_service_builds_and_caches(session):
    service = MatrixService(HaversineFallbackProvider())
    points = [JOBURG, SOWETO, PRETORIA]
    matrix = service.build_matrix(session, points)
    session.commit()

    assert matrix.size == 3
    assert matrix.completeness == 1.0
    assert matrix.fallback_fraction == 1.0  # provider is the fallback type
    assert matrix.duration_s(0, 1) > 0

    cached_rows = session.execute(select(func.count(t.MatrixCacheRow.id))).scalar()
    assert cached_rows == 9

    # Second call is served from cache: replace provider with one that fails.
    class ExplodingProvider:
        name = "haversine_fallback"  # same cache namespace
        is_fallback = True

        def compute(self, points):
            raise AssertionError("should not be called — cache must serve")

    cached_service = MatrixService(ExplodingProvider())
    matrix2 = cached_service.build_matrix(session, points)
    assert matrix2.completeness == 1.0
    assert matrix2.duration_s(0, 1) == matrix.duration_s(0, 1)


def _osrm_transport(fail_first: bool = False):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if fail_first and calls["n"] == 1:
            return httpx.Response(429, headers={"Retry-After": "0"})
        n_src = len(request.url.params["sources"].split(";"))
        n_dst = len(request.url.params["destinations"].split(";"))
        return httpx.Response(
            200,
            json={
                "code": "Ok",
                "durations": [[100.0 * (1 + j) for j in range(n_dst)] for _ in range(n_src)],
                "distances": [[1000.0 * (1 + j) for j in range(n_dst)] for _ in range(n_src)],
            },
        )

    return httpx.MockTransport(handler), calls


def test_osrm_provider_parses_table_response():
    transport, _ = _osrm_transport()
    provider = OsrmMatrixProvider("http://osrm.test", client=httpx.Client(transport=transport))
    result = provider.compute([JOBURG, SOWETO])
    assert result.entries[0][1].duration_s == 200.0
    assert result.entries[0][1].distance_m == 2000.0
    assert not result.entries[0][1].is_fallback


def test_osrm_provider_retries_rate_limit():
    transport, calls = _osrm_transport(fail_first=True)
    provider = OsrmMatrixProvider("http://osrm.test", client=httpx.Client(transport=transport))
    result = provider.compute([JOBURG, SOWETO])
    assert calls["n"] == 2  # one 429 then success
    assert result.entries[0][1] is not None


def test_partial_failure_filled_by_fallback(session):
    from aiviate.matrix.provider import MatrixEntry

    class PartialProvider:
        name = "partial"
        is_fallback = False

        def compute(self, points):
            n = len(points)
            entries = [
                [
                    None if (i, j) == (0, 1) else MatrixEntry(distance_m=1000.0, duration_s=60.0)
                    for j in range(n)
                ]
                for i in range(n)
            ]
            return PartialMatrixResult(entries=entries)

    service = MatrixService(PartialProvider(), fallback=HaversineFallbackProvider())
    matrix = service.build_matrix(session, [JOBURG, SOWETO])

    assert matrix.completeness == 1.0
    assert matrix.entries[0][1].is_fallback  # gap filled by fallback
    assert not matrix.entries[1][0].is_fallback
    assert matrix.fallback_entry_count == 1

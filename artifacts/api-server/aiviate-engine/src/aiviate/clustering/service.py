"""Capacity-aware geographic clustering.

Produces *initial suggestions* for the solver — deterministic seeded k-means
on coordinates (a permitted straight-line signal), followed by capacity
rebalancing so no cluster obviously exceeds a vehicle. The solver is free to
move orders between clusters; clustering only shapes the first solution.

Orders are never grouped by place names: only coordinates, travel signal,
capacities and driver start points are used.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from aiviate.domain.geo import Coordinate, haversine_km
from aiviate.observability import get_logger, log_ctx

logger = get_logger(__name__)

_MAX_ITERATIONS = 50


@dataclass
class ClusterItem:
    order_index: int  # caller's index (e.g. into SolverInput.orders)
    coordinate: Coordinate
    weight: float
    volume: float
    service_minutes: float


@dataclass
class Cluster:
    centroid: Coordinate
    items: list[ClusterItem] = field(default_factory=list)

    @property
    def total_weight(self) -> float:
        return sum(i.weight for i in self.items)

    @property
    def total_volume(self) -> float:
        return sum(i.volume for i in self.items)

    @property
    def estimated_service_minutes(self) -> float:
        return sum(i.service_minutes for i in self.items)

    def order_indices_nearest_neighbour(self, start: Coordinate) -> list[int]:
        """Greedy nearest-neighbour ordering — a sane initial route sequence."""
        remaining = list(self.items)
        sequence: list[int] = []
        cursor = start
        while remaining:
            best = min(remaining, key=lambda item: haversine_km(cursor, item.coordinate))
            sequence.append(best.order_index)
            cursor = best.coordinate
            remaining.remove(best)
        return sequence


def cluster_orders(
    items: list[ClusterItem],
    seeds: list[Coordinate],
    max_weight_per_cluster: float | None = None,
    max_volume_per_cluster: float | None = None,
) -> list[Cluster]:
    """K-means seeded by driver start locations (deterministic, no RNG).

    ``seeds`` set both k (one cluster per available driver/vehicle pair) and
    the initial centroids, which anchors clusters near where drivers start.
    """
    if not items or not seeds:
        return []

    centroids = list(seeds)
    assignment = [0] * len(items)
    for _ in range(_MAX_ITERATIONS):
        changed = False
        for idx, item in enumerate(items):
            nearest = min(range(len(centroids)),
                          key=lambda c: haversine_km(item.coordinate, centroids[c]))
            if assignment[idx] != nearest:
                assignment[idx] = nearest
                changed = True
        for c in range(len(centroids)):
            members = [items[i] for i in range(len(items)) if assignment[i] == c]
            if members:
                centroids[c] = Coordinate(
                    latitude=sum(m.coordinate.latitude for m in members) / len(members),
                    longitude=sum(m.coordinate.longitude for m in members) / len(members),
                )
        if not changed:
            break

    clusters = [Cluster(centroid=centroids[c]) for c in range(len(centroids))]
    for idx, item in enumerate(items):
        clusters[assignment[idx]].items.append(item)

    _rebalance(clusters, max_weight_per_cluster, max_volume_per_cluster)
    logger.info(
        "clustering complete",
        extra=log_ctx(clusters=[len(c.items) for c in clusters]),
    )
    return clusters


def _rebalance(
    clusters: list[Cluster],
    max_weight: float | None,
    max_volume: float | None,
) -> None:
    """Move boundary orders out of overloaded clusters into the nearest cluster
    with slack. Best effort: the solver still enforces real capacities."""

    def overloaded(cluster: Cluster) -> bool:
        return (max_weight is not None and cluster.total_weight > max_weight) or (
            max_volume is not None and cluster.total_volume > max_volume
        )

    def has_slack(cluster: Cluster, item: ClusterItem) -> bool:
        if max_weight is not None and cluster.total_weight + item.weight > max_weight:
            return False
        if max_volume is not None and cluster.total_volume + item.volume > max_volume:
            return False
        return True

    for _ in range(_MAX_ITERATIONS):
        moved = False
        for cluster in clusters:
            if not overloaded(cluster) or len(cluster.items) <= 1:
                continue
            # Move the member farthest from this centroid.
            outlier = max(cluster.items, key=lambda i: haversine_km(i.coordinate, cluster.centroid))
            candidates = sorted(
                (c for c in clusters if c is not cluster and has_slack(c, outlier)),
                key=lambda c: haversine_km(outlier.coordinate, c.centroid),
            )
            if candidates:
                cluster.items.remove(outlier)
                candidates[0].items.append(outlier)
                moved = True
        if not moved:
            break

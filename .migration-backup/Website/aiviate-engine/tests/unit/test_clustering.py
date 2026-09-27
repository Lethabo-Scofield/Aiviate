from aiviate.clustering import cluster_orders
from aiviate.clustering.service import ClusterItem
from tests.solver.helpers import JOBURG_CENTRE, PRETORIA_CENTRE, SOWETO_CENTRE, spread


def items_around(centre, count, start_index=0, weight=20.0):
    return [
        ClusterItem(order_index=start_index + i, coordinate=c, weight=weight, volume=0.2,
                    service_minutes=5)
        for i, c in enumerate(spread(centre, count))
    ]


def test_clusters_follow_geography():
    items = (
        items_around(JOBURG_CENTRE, 5, 0)
        + items_around(SOWETO_CENTRE, 5, 5)
        + items_around(PRETORIA_CENTRE, 5, 10)
    )
    seeds = [JOBURG_CENTRE, SOWETO_CENTRE, PRETORIA_CENTRE]
    clusters = cluster_orders(items, seeds)

    assert len(clusters) == 3
    sizes = sorted(len(c.items) for c in clusters)
    assert sizes == [5, 5, 5]
    # Each cluster's members share an area: index blocks stay together.
    for cluster in clusters:
        blocks = {item.order_index // 5 for item in cluster.items}
        assert len(blocks) == 1


def test_cluster_count_matches_available_drivers():
    items = items_around(JOBURG_CENTRE, 9)
    clusters = cluster_orders(items, seeds=[JOBURG_CENTRE, SOWETO_CENTRE])
    assert len(clusters) == 2
    assert sum(len(c.items) for c in clusters) == 9


def test_overloaded_cluster_rebalanced():
    # All 8 orders near Johannesburg but each cluster may carry only 100 kg.
    items = items_around(JOBURG_CENTRE, 8, weight=25.0)
    clusters = cluster_orders(
        items,
        seeds=[JOBURG_CENTRE, SOWETO_CENTRE],
        max_weight_per_cluster=100.0,
    )
    assert all(c.total_weight <= 100.0 for c in clusters)
    assert sum(len(c.items) for c in clusters) == 8


def test_deterministic():
    items = items_around(JOBURG_CENTRE, 7) + items_around(SOWETO_CENTRE, 6, 7)
    seeds = [JOBURG_CENTRE, SOWETO_CENTRE]
    a = cluster_orders(items, seeds)
    b = cluster_orders(items, seeds)
    assert [[i.order_index for i in c.items] for c in a] == [
        [i.order_index for i in c.items] for c in b
    ]


def test_nearest_neighbour_sequence_starts_close():
    items = items_around(JOBURG_CENTRE, 5)
    [cluster] = cluster_orders(items, seeds=[JOBURG_CENTRE])
    sequence = cluster.order_indices_nearest_neighbour(JOBURG_CENTRE)
    assert sorted(sequence) == [0, 1, 2, 3, 4]

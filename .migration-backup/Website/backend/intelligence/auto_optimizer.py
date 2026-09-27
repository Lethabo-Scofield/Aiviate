"""Auto route optimization.

Reorders a job's stops in place using the existing OR-Tools / 2-opt solver.
When a `start_lat / start_lng` are passed (e.g. a driver's live location), the
optimization anchors to that point; otherwise it falls back to the depot. The
function is conservative — it does not persist a new order unless the optimizer
actually beats the current order.
"""
from typing import Dict, Optional

from optimize_route import build_distance_matrix, solve_tsp, DEPOT


def _seq_total(seq, dist_matrix):
    return sum(dist_matrix[seq[i]][seq[i + 1]] for i in range(len(seq) - 1))


def optimize_job_stops(
    db,
    job,
    *,
    start_lat: Optional[float] = None,
    start_lng: Optional[float] = None,
) -> Dict:
    """Reorder `job.stops` in place. Returns a structured summary.

    Status values:
      - "skipped"       — fewer than 2 stops with coordinates
      - "no_improvement"— optimizer found no shorter route
      - "ok"            — order changed and persisted
    """
    stops = sorted(list(job.stops or []), key=lambda s: s.stop_number or 0)
    geo_stops = [s for s in stops if s.lat is not None and s.lng is not None]
    if len(geo_stops) < 2:
        return {
            "status": "skipped",
            "reason": "Job has fewer than 2 geocoded stops",
            "used_driver_location": False,
        }

    used_driver_location = start_lat is not None and start_lng is not None
    sx = start_lat if used_driver_location else DEPOT["lat"]
    sy = start_lng if used_driver_location else DEPOT["lng"]

    locations = [(sx, sy)] + [(s.lat, s.lng) for s in geo_stops]
    dist_matrix = build_distance_matrix(locations)

    # IMPORTANT: solve_tsp returns a CLOSED-tour distance (includes the
    # return-to-start edge), but we deliver an OPEN path (start → last stop,
    # no return). Recompute both distances as open paths from the same model
    # so the comparison is apples-to-apples.
    current_seq = [0] + list(range(1, len(geo_stops) + 1))
    distance_before = _seq_total(current_seq, dist_matrix)

    new_route, _closed_tour_distance = solve_tsp(dist_matrix, start=0)
    distance_after = _seq_total(new_route, dist_matrix)

    if distance_after >= distance_before - 0.01:
        return {
            "status": "no_improvement",
            "distance_before_km": round(distance_before, 2),
            "distance_after_km": round(distance_after, 2),
            "used_driver_location": used_driver_location,
        }

    new_order = [geo_stops[i - 1] for i in new_route if i > 0]
    for idx, stop in enumerate(new_order, start=1):
        stop.stop_number = idx

    if hasattr(job, "total_distance_km"):
        job.total_distance_km = round(distance_after, 2)
    db.commit()

    return {
        "status": "ok",
        "stops_reordered": len(new_order),
        "distance_before_km": round(distance_before, 2),
        "distance_after_km": round(distance_after, 2),
        "distance_saved_km": round(distance_before - distance_after, 2),
        "used_driver_location": used_driver_location,
    }

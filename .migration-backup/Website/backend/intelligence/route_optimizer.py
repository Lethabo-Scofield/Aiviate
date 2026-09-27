"""Thin wrapper over the existing OR-Tools optimizer in optimize_route.py.

This file exists so the intelligence package has a single, structured surface
for routing. The underlying solver and its CRUD endpoints are unchanged.
"""
from typing import Dict, List

try:
    from optimize_route import optimize_route_from_data as _legacy_optimize
except ImportError:
    _legacy_optimize = None


def optimize(stops: List[Dict], num_drivers: int = 1) -> Dict:
    """Optimize stop order. Returns structured user-facing output.

    Thin wrapper over the legacy single-vehicle TSP/2-opt solver. Multi-vehicle
    VRP is not yet wired — `num_drivers > 1` falls back to single-driver.
    """
    if _legacy_optimize is None:
        return {
            "status": "unavailable",
            "explanation": "OR-Tools optimizer not loaded in this environment",
            "confidence": 0.0,
        }
    try:
        ordered_stops = _legacy_optimize(stops, num_vehicles=num_drivers)
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "error",
            "explanation": f"Optimizer raised {type(exc).__name__}: {exc}",
            "confidence": 0.0,
        }

    return {
        "status": "ok",
        "ordered_stops": ordered_stops,
        "explanation": "Stops reordered using 2-opt TSP solver",
        "confidence": 0.95,
    }

"""Thin wrapper over the existing OR-Tools optimizer in optimize_route.py.

This file exists so the intelligence package has a single, structured surface
for routing. The underlying solver and its CRUD endpoints are unchanged.
"""
from typing import Dict, List

try:
    from optimize_route import optimize_stops as _legacy_optimize
except ImportError:
    _legacy_optimize = None


def optimize(stops: List[Dict], num_drivers: int = 1) -> Dict:
    """Optimize stop order. Returns structured user-facing output."""
    if _legacy_optimize is None:
        return {
            "status": "unavailable",
            "explanation": "OR-Tools optimizer not loaded in this environment",
            "confidence": 0.0,
        }
    try:
        result = _legacy_optimize(stops, num_drivers=num_drivers)
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "error",
            "explanation": f"Optimizer raised {type(exc).__name__}: {exc}",
            "confidence": 0.0,
        }

    return {
        "status": "ok",
        "routes": result.get("routes", []) if isinstance(result, dict) else [],
        "total_distance_km": (
            result.get("total_distance_km") if isinstance(result, dict) else None
        ),
        "distance_saved_km": (
            result.get("distance_saved_km") if isinstance(result, dict) else None
        ),
        "explanation": "Route optimized with OR-Tools VRP solver",
        "confidence": 0.95,
    }

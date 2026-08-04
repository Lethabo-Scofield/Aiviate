"""ETA prediction.

Heuristic for now: distance / average speed (with traffic and weather
multipliers) plus stop service time. Replace with an ML regressor later
without changing the function signature.
"""
from typing import Dict, Optional

DEFAULT_AVG_SPEED_KMH = 35.0
DEFAULT_SERVICE_MIN = 8.0


def predict_eta_minutes(
    distance_km: float,
    avg_speed_kmh: float = DEFAULT_AVG_SPEED_KMH,
    service_time_min: float = DEFAULT_SERVICE_MIN,
    traffic_multiplier: float = 1.0,
    weather_multiplier: float = 1.0,
) -> Dict:
    if distance_km is None or distance_km < 0 or avg_speed_kmh is None or avg_speed_kmh <= 0:
        return {
            "eta_minutes": None,
            "confidence": 0.0,
            "reason": "Invalid inputs",
            "explanation": "Distance and speed must be positive numbers",
        }
    drive_min = (distance_km / avg_speed_kmh) * 60.0 * traffic_multiplier * weather_multiplier
    total = drive_min + max(0.0, service_time_min)
    # Confidence drops as multipliers depart from baseline (more uncertainty).
    drift = abs(traffic_multiplier - 1.0) + abs(weather_multiplier - 1.0)
    confidence = max(0.40, min(0.95, 0.95 - 0.20 * drift))
    return {
        "eta_minutes": round(total, 1),
        "drive_minutes": round(drive_min, 1),
        "service_minutes": round(service_time_min, 1),
        "confidence": round(confidence, 2),
        "explanation": (
            f"{round(distance_km, 1)} km at {round(avg_speed_kmh)} km/h "
            f"+ {round(service_time_min)} min service"
            + (f" (traffic ×{traffic_multiplier:g})" if traffic_multiplier != 1.0 else "")
            + (f" (weather ×{weather_multiplier:g})" if weather_multiplier != 1.0 else "")
        ),
    }

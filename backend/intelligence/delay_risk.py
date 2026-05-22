"""Delay risk scoring.

Compares predicted ETA against the promised delivery window and surfaces a
plain-language risk level. No magic — pure thresholds we can tune.
"""
from typing import Dict, Optional


def score_delay_risk(
    eta_minutes: Optional[float],
    promised_minutes: Optional[float],
    weather_factor: float = 1.0,
    traffic_factor: float = 1.0,
) -> Dict:
    if eta_minutes is None or promised_minutes is None or promised_minutes <= 0:
        return {
            "risk": "unknown",
            "delay_minutes": 0,
            "reason": "No promised window on the stop",
            "recommended_action": "Set a delivery window on this stop",
        }

    slack = promised_minutes - eta_minutes
    delay = max(0.0, eta_minutes - promised_minutes)
    stressed = weather_factor > 1.15 or traffic_factor > 1.15

    if slack >= 10 and not stressed:
        return {
            "risk": "low",
            "delay_minutes": 0,
            "reason": "Comfortably inside the promised window",
            "recommended_action": "None",
        }
    if slack >= 0:
        return {
            "risk": "medium",
            "delay_minutes": 0,
            "reason": "Inside the window but the margin is tight",
            "recommended_action": "Monitor — proactive notice if conditions worsen",
        }
    if delay <= 10:
        return {
            "risk": "medium",
            "delay_minutes": round(delay, 1),
            "reason": f"Predicted {round(delay)} min late",
            "recommended_action": "Send a proactive delay notice",
        }
    return {
        "risk": "high",
        "delay_minutes": round(delay, 1),
        "reason": f"Predicted {round(delay)} min late",
        "recommended_action": "Notify customer and consider reassigning the stop",
    }

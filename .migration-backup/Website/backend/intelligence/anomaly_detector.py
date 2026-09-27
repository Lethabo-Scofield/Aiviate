"""Rule-based anomaly detection over telemetry and recent events.

These rules are intentionally explicit and tunable. Each detection carries a
confidence score so the recommendation engine can rank them.
"""
from typing import Dict, List, Optional, Union
from datetime import datetime, timezone


def _minutes_ago(value: Optional[Union[str, datetime]]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        dt = value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt).total_seconds() / 60.0


def detect_device_anomalies(devices: List[Dict]) -> List[Dict]:
    """Find devices that are silent, offline, or running out of battery."""
    out: List[Dict] = []
    for d in devices:
        mins = _minutes_ago(d.get("last_seen"))
        if d.get("status") == "offline" and mins is not None and mins >= 10:
            out.append({
                "kind": "device_offline",
                "severity": "high" if mins >= 30 else "medium",
                "subject_id": d.get("id"),
                "subject_name": d.get("name"),
                "what": f"{d.get('name')} hasn't reported in {int(mins)} min",
                "confidence": 0.95,
                "minutes_silent": int(mins),
            })
        elif (
            d.get("battery_pct") is not None
            and d["battery_pct"] < 20
            and d.get("status") == "online"
        ):
            out.append({
                "kind": "battery_low",
                "severity": "medium" if d["battery_pct"] < 10 else "low",
                "subject_id": d.get("id"),
                "subject_name": d.get("name"),
                "what": f"{d.get('name')} battery at {d['battery_pct']}%",
                "confidence": 0.99,
                "battery_pct": d["battery_pct"],
            })
    return out


def detect_fatigue_clusters(
    events: List[Dict], hours: float = 4.0, threshold: int = 2
) -> List[Dict]:
    """Find drivers with N or more fatigue events in the last `hours`."""
    by_driver: Dict[str, List[Dict]] = {}
    for e in events:
        if e.get("event_type") != "fatigue":
            continue
        mins = _minutes_ago(e.get("created_at"))
        if mins is None or mins > hours * 60:
            continue
        did = e.get("driver_id")
        if not did:
            continue
        by_driver.setdefault(did, []).append(e)

    out: List[Dict] = []
    for did, evs in by_driver.items():
        if len(evs) >= threshold:
            out.append({
                "kind": "fatigue_cluster",
                "severity": "high" if len(evs) >= 4 else "medium",
                "subject_id": did,
                "what": f"{len(evs)} drowsiness events in the last {int(hours)} hours",
                "confidence": round(min(0.98, 0.70 + 0.06 * len(evs)), 2),
                "event_count": len(evs),
                "window_hours": hours,
            })
    return out


def detect_blocked_drivers(liveops: List[Dict]) -> List[Dict]:
    """Drivers flagged as blocked but still appearing in active ops."""
    out: List[Dict] = []
    for d in liveops:
        if d.get("blocked") or d.get("status") == "blocked":
            out.append({
                "kind": "driver_blocked",
                "severity": "medium",
                "subject_id": d.get("driver_id"),
                "subject_name": d.get("driver_name"),
                "what": f"{d.get('driver_name')} is in a blocked state",
                "confidence": 0.90,
            })
    return out

"""Turn raw algorithm outputs into ranked, plain-language recommendations.

Each recommendation has the shape the UI expects:
  id, kind, category, what, why, action, expected_benefit,
  confidence, severity, requires_approval, subject_id, link
"""
from typing import Dict, List, Optional

SEVERITY_WEIGHT = {"critical": 4, "high": 3, "medium": 2, "low": 1}


def _rec_id(kind: str, subject_id: Optional[str]) -> str:
    return f"{kind}:{subject_id or 'unknown'}"


def build_recommendations(
    device_anomalies: Optional[List[Dict]] = None,
    fatigue_clusters: Optional[List[Dict]] = None,
    blocked_drivers: Optional[List[Dict]] = None,
    open_critical_alerts: Optional[List[Dict]] = None,
    delay_risks: Optional[List[Dict]] = None,
) -> List[Dict]:
    recs: List[Dict] = []

    for f in fatigue_clusters or []:
        recs.append({
            "id": _rec_id("rotate_driver", f["subject_id"]),
            "kind": "rotate_driver",
            "category": "Driver risk",
            "what": f["what"],
            "why": "Continued driving sharply raises incident probability",
            "action": "Rotate the driver and reassign their remaining stops",
            "expected_benefit": "Brings incident probability back to baseline",
            "confidence": f["confidence"],
            "severity": f["severity"],
            "requires_approval": True,
            "subject_id": f["subject_id"],
            "link": "/drivers",
        })

    for d in device_anomalies or []:
        if d["kind"] == "device_offline":
            recs.append({
                "id": _rec_id("check_device", d["subject_id"]),
                "kind": "check_device",
                "category": "Telemetry",
                "what": d["what"],
                "why": "Driver is unmonitored — fatigue inference is offline",
                "action": "Call driver to confirm power and connection",
                "expected_benefit": "Restores live safety monitoring",
                "confidence": d["confidence"],
                "severity": d["severity"],
                "requires_approval": True,
                "subject_id": d["subject_id"],
                "link": "/devices",
            })
        elif d["kind"] == "battery_low":
            recs.append({
                "id": _rec_id("charge_device", d["subject_id"]),
                "kind": "charge_device",
                "category": "Telemetry",
                "what": d["what"],
                "why": "Below the 20% threshold — device risks dropping offline",
                "action": "Ask driver to plug the unit in at the next stop",
                "expected_benefit": "Reduces the chance of a monitoring gap",
                "confidence": d["confidence"],
                "severity": d["severity"],
                "requires_approval": False,
                "subject_id": d["subject_id"],
                "link": "/devices",
            })

    for b in blocked_drivers or []:
        recs.append({
            "id": _rec_id("unblock_driver", b["subject_id"]),
            "kind": "unblock_driver",
            "category": "Dispatch",
            "what": b["what"],
            "why": "Blocked drivers cannot accept new dispatches — check whether they hold active routes",
            "action": "Unblock the driver or, if they hold a route, reassign it",
            "expected_benefit": "Frees the driver for dispatch and prevents stranded routes",
            "confidence": b["confidence"],
            "severity": b["severity"],
            "requires_approval": True,
            "subject_id": b["subject_id"],
            "link": "/dispatch",
        })

    for a in open_critical_alerts or []:
        recs.append({
            "id": _rec_id("acknowledge_alert", a["id"]),
            "kind": "acknowledge_alert",
            "category": "Critical alert",
            "what": a.get("title") or "Critical alert open",
            "why": a.get("message") or "Flagged critical and not yet acknowledged",
            "action": "Acknowledge and dispatch a response",
            "expected_benefit": "Closes the operational risk loop",
            "confidence": 0.99,
            "severity": "critical",
            "requires_approval": True,
            "subject_id": a["id"],
            "link": "/intelligence",
        })

    for r in delay_risks or []:
        if r.get("risk") in ("medium", "high"):
            recs.append({
                "id": _rec_id("notify_customer", r.get("stop_id")),
                "kind": "notify_customer",
                "category": "Delay",
                "what": (
                    f"{r.get('customer_name', 'Customer')} likely to receive their order "
                    f"{int(r.get('delay_minutes', 0))} min late"
                ),
                "why": r.get("reason", ""),
                "action": "Send a proactive delay notification",
                "expected_benefit": "Reduces inbound complaints and reschedule churn",
                "confidence": 0.80,
                "severity": "high" if r["risk"] == "high" else "medium",
                "requires_approval": r["risk"] == "high",
                "subject_id": r.get("stop_id"),
                "link": "/dispatch",
            })

    recs.sort(
        key=lambda r: (SEVERITY_WEIGHT.get(r["severity"], 0), r["confidence"]),
        reverse=True,
    )
    return recs

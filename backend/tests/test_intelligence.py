"""Unit tests for the intelligence package — pure functions only, no DB.

Run from the backend/ directory:
    PYTHONPATH=. python -m unittest tests/test_intelligence.py -v
"""
import unittest
from datetime import datetime, timedelta, timezone

from intelligence.eta_predictor import predict_eta_minutes
from intelligence.delay_risk import score_delay_risk
from intelligence.anomaly_detector import (
    detect_device_anomalies,
    detect_fatigue_clusters,
    detect_blocked_drivers,
)
from intelligence.recommendation_engine import build_recommendations


def _ago(minutes):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()


class ETAPredictorTests(unittest.TestCase):
    def test_basic_eta_math(self):
        r = predict_eta_minutes(distance_km=10.5, avg_speed_kmh=35.0, service_time_min=8.0)
        # 10.5 / 35 * 60 = 18.0 drive minutes + 8 = 26 total
        self.assertEqual(r["eta_minutes"], 26.0)
        self.assertEqual(r["drive_minutes"], 18.0)
        self.assertGreater(r["confidence"], 0.9)

    def test_traffic_multiplier_extends_eta_and_lowers_confidence(self):
        baseline = predict_eta_minutes(10.0, 30.0, 5.0, traffic_multiplier=1.0)
        stressed = predict_eta_minutes(10.0, 30.0, 5.0, traffic_multiplier=1.5)
        self.assertGreater(stressed["eta_minutes"], baseline["eta_minutes"])
        self.assertLess(stressed["confidence"], baseline["confidence"])

    def test_invalid_inputs_return_unknown(self):
        r = predict_eta_minutes(distance_km=-1, avg_speed_kmh=30)
        self.assertIsNone(r["eta_minutes"])
        self.assertEqual(r["confidence"], 0.0)

        r = predict_eta_minutes(distance_km=10, avg_speed_kmh=0)
        self.assertIsNone(r["eta_minutes"])


class DelayRiskTests(unittest.TestCase):
    def test_low_when_comfortably_inside_window(self):
        r = score_delay_risk(eta_minutes=20, promised_minutes=40)
        self.assertEqual(r["risk"], "low")
        self.assertEqual(r["delay_minutes"], 0)

    def test_medium_when_inside_but_tight(self):
        r = score_delay_risk(eta_minutes=38, promised_minutes=40)
        self.assertEqual(r["risk"], "medium")
        self.assertEqual(r["delay_minutes"], 0)

    def test_medium_for_small_predicted_delay(self):
        r = score_delay_risk(eta_minutes=45, promised_minutes=40)
        self.assertEqual(r["risk"], "medium")
        self.assertEqual(r["delay_minutes"], 5.0)

    def test_high_for_large_predicted_delay(self):
        r = score_delay_risk(eta_minutes=70, promised_minutes=40)
        self.assertEqual(r["risk"], "high")
        self.assertEqual(r["delay_minutes"], 30.0)
        self.assertIn("Notify customer", r["recommended_action"])

    def test_unknown_when_no_window(self):
        r = score_delay_risk(eta_minutes=20, promised_minutes=None)
        self.assertEqual(r["risk"], "unknown")


class AnomalyDetectorTests(unittest.TestCase):
    def test_device_offline_after_10_minutes(self):
        devices = [
            {"id": "D1", "name": "DEV-1", "status": "offline", "last_seen": _ago(15), "battery_pct": 50},
            {"id": "D2", "name": "DEV-2", "status": "offline", "last_seen": _ago(5), "battery_pct": 50},
        ]
        out = detect_device_anomalies(devices)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["kind"], "device_offline")
        self.assertEqual(out[0]["subject_id"], "D1")

    def test_battery_low_only_when_online(self):
        devices = [
            {"id": "A", "name": "A", "status": "online", "battery_pct": 12, "last_seen": _ago(1)},
            {"id": "B", "name": "B", "status": "offline", "battery_pct": 5, "last_seen": _ago(2)},
            {"id": "C", "name": "C", "status": "online", "battery_pct": 80, "last_seen": _ago(1)},
        ]
        out = detect_device_anomalies(devices)
        kinds = {(d["subject_id"], d["kind"]) for d in out}
        self.assertIn(("A", "battery_low"), kinds)
        self.assertNotIn(("B", "battery_low"), kinds)
        self.assertNotIn(("C", "battery_low"), kinds)

    def test_fatigue_cluster_requires_threshold(self):
        events = [
            {"event_type": "fatigue", "driver_id": "DR1", "created_at": _ago(30)},
            {"event_type": "fatigue", "driver_id": "DR1", "created_at": _ago(60)},
            {"event_type": "fatigue", "driver_id": "DR2", "created_at": _ago(30)},
            {"event_type": "fatigue", "driver_id": "DR3", "created_at": _ago(600)},  # too old
            {"event_type": "harsh_brake", "driver_id": "DR1", "created_at": _ago(30)},  # wrong type
        ]
        out = detect_fatigue_clusters(events, hours=4, threshold=2)
        subjects = {x["subject_id"] for x in out}
        self.assertEqual(subjects, {"DR1"})

    def test_blocked_drivers_flagged(self):
        live = [
            {"driver_id": "X", "driver_name": "X", "blocked": True, "status": "idle"},
            {"driver_id": "Y", "driver_name": "Y", "blocked": False, "status": "blocked"},
            {"driver_id": "Z", "driver_name": "Z", "blocked": False, "status": "on_route"},
        ]
        out = detect_blocked_drivers(live)
        ids = {x["subject_id"] for x in out}
        self.assertEqual(ids, {"X", "Y"})


class RecommendationEngineTests(unittest.TestCase):
    def test_assembly_and_severity_ordering(self):
        recs = build_recommendations(
            device_anomalies=[
                {"kind": "battery_low", "subject_id": "D1", "subject_name": "D1",
                 "what": "low", "severity": "low", "confidence": 0.99},
            ],
            fatigue_clusters=[
                {"subject_id": "DR1", "what": "fatigue", "severity": "high", "confidence": 0.90},
            ],
            open_critical_alerts=[
                {"id": "A1", "title": "Crash", "message": "", "severity": "critical"},
            ],
        )
        # Critical alert outranks fatigue (high) outranks battery_low (low)
        kinds = [r["kind"] for r in recs]
        self.assertEqual(kinds[0], "acknowledge_alert")
        self.assertEqual(kinds[1], "rotate_driver")
        self.assertEqual(kinds[-1], "charge_device")

    def test_every_rec_has_required_shape(self):
        recs = build_recommendations(
            fatigue_clusters=[
                {"subject_id": "DR1", "what": "x", "severity": "medium", "confidence": 0.8}
            ],
        )
        required = {
            "id", "kind", "category", "what", "why", "action",
            "expected_benefit", "confidence", "severity",
            "requires_approval", "subject_id", "link",
        }
        for r in recs:
            self.assertTrue(required.issubset(r.keys()), f"missing keys in {r}")


if __name__ == "__main__":
    unittest.main()

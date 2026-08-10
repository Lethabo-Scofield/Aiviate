import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost/test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from routes.public_tracking import _safe_status


class PublicTrackingPrivacyTests(unittest.TestCase):
    def test_public_response_excludes_sensitive_fields(self):
        now = datetime.now(timezone.utc)
        stop = SimpleNamespace(
            id="STOP-123",
            order_id="MERCH-9001",
            customer_name="Private Customer",
            phone="+27820000000",
            notes="Gate code 1234",
            address="Secret address",
            lat=-26.1,
            lng=28.1,
            completed=False,
            completed_at=None,
            created_at=now,
            time_window_start="2026-08-10T10:00:00+02:00",
            time_window_end="2026-08-10T12:00:00+02:00",
        )
        job = SimpleNamespace(
            driver_id="DRV-1",
            status="assigned",
            assigned_at=now,
            estimated_time_min=60,
        )
        company = SimpleNamespace(name="Aiviate Test")
        tracking = SimpleNamespace(
            public_reference="MERCH-9001",
            expires_at=now + timedelta(days=1),
        )

        out = _safe_status(stop, job=job, company=company, tracking=tracking)
        blob = str(out)

        self.assertEqual(out["branding"]["company_name"], "Aiviate Test")
        self.assertEqual(out["order"]["reference"], "MERCH-9001")
        self.assertEqual(out["order"]["status"], "scheduled")
        self.assertNotIn("+27820000000", blob)
        self.assertNotIn("Gate code", blob)
        self.assertNotIn("Secret address", blob)
        self.assertNotIn("DRV-1", blob)
        self.assertNotIn("STOP-123", blob)

    def test_completed_stop_gets_proof_summary_without_raw_evidence(self):
        now = datetime.now(timezone.utc)
        stop = SimpleNamespace(
            id="STOP-456",
            order_id="STORE-7",
            completed=True,
            completed_at=now,
            created_at=now - timedelta(hours=2),
            time_window_start="",
            time_window_end="",
            lat=-26.1,
            lng=28.1,
        )
        tracking = SimpleNamespace(public_reference="STORE-7", expires_at=now + timedelta(days=1))

        out = _safe_status(stop, tracking=tracking)

        self.assertEqual(out["order"]["status"], "delivered")
        self.assertEqual(out["delivery"]["proof_summary"]["type"], "delivery_confirmation")
        self.assertTrue(out["delivery"]["proof_summary"]["package_verified"])
        self.assertFalse(out["delivery"]["reschedule_allowed"])


if __name__ == "__main__":
    unittest.main()

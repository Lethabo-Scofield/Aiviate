import importlib
import os
import sys
import tempfile
import unittest

os.environ.setdefault("JWT_SECRET", "test-secret")

_FRESH = ("app", "models", "middleware", "utils", "config", "routes")


class CommunityWellnessApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(cls._tmp.name, 'test.db')}"
        os.environ.pop("NEON_DATABASE_URL", None)
        # Other test modules import models against a Postgres URL; reload
        # everything that captured the engine so this suite uses SQLite.
        for name in list(sys.modules):
            if name in _FRESH or name.startswith("routes."):
                sys.modules.pop(name)
        app_module = importlib.import_module("app")
        cls.models = importlib.import_module("models")
        cls.utils = importlib.import_module("utils")
        cls.client = app_module.create_app().test_client()

        db = cls.models.SessionLocal()
        m = cls.models
        db.add_all([
            m.Company(id="CMP-A", name="Alpha"),
            m.Company(id="CMP-B", name="Beta"),
        ])
        db.flush()
        db.add(m.Driver(id="DRV-1", name="Thandi Driver", company_id="CMP-A"))
        db.flush()
        users = [
            m.User(id="USR-ADMIN", email="admin@a.test", password_hash="x", name="Ada Admin", role="admin", company_id="CMP-A"),
            m.User(id="USR-DRV", email="drv@a.test", password_hash="x", name="Thandi Driver", role="driver", company_id="CMP-A", driver_id="DRV-1"),
            m.User(id="USR-OTHER", email="other@b.test", password_hash="x", name="Other Co", role="driver", company_id="CMP-B"),
        ]
        db.add_all(users)
        db.commit()
        cls.tokens = {u.id: cls.utils.generate_token(u) for u in users}
        db.close()

    @classmethod
    def tearDownClass(cls):
        cls.models.engine.dispose()
        cls._tmp.cleanup()

    def _h(self, user_id):
        return {"Authorization": f"Bearer {self.tokens[user_id]}"}

    # ── Community ──────────────────────────────────────────────────────────

    def test_driver_posts_and_replies_are_company_scoped(self):
        res = self.client.post("/api/community/posts", json={"body": "Roadworks on the N1 north", "category": "road"}, headers=self._h("USR-DRV"))
        self.assertEqual(res.status_code, 201)
        post_id = res.get_json()["post"]["id"]

        res = self.client.post("/api/community/posts", json={"body": "Thanks, rerouting", "parent_id": post_id}, headers=self._h("USR-ADMIN"))
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.get_json()["post"]["category"], "road")

        posts = self.client.get("/api/community/posts", headers=self._h("USR-DRV")).get_json()["posts"]
        thread = next(p for p in posts if p["id"] == post_id)
        self.assertEqual(thread["author_name"], "Thandi Driver")
        self.assertEqual([r["body"] for r in thread["replies"]], ["Thanks, rerouting"])

        other = self.client.get("/api/community/posts", headers=self._h("USR-OTHER")).get_json()["posts"]
        self.assertNotIn(post_id, [p["id"] for p in other])
        res = self.client.post("/api/community/posts", json={"body": "hi", "parent_id": post_id}, headers=self._h("USR-OTHER"))
        self.assertEqual(res.status_code, 404)

    def test_only_dispatchers_can_post_notices(self):
        res = self.client.post("/api/community/posts", json={"body": "Depot closes at 5", "category": "notice"}, headers=self._h("USR-DRV"))
        self.assertEqual(res.status_code, 400)
        res = self.client.post("/api/community/posts", json={"body": "Depot closes at 5", "category": "notice"}, headers=self._h("USR-ADMIN"))
        self.assertEqual(res.status_code, 201)

    def test_post_validation(self):
        res = self.client.post("/api/community/posts", json={"body": "   "}, headers=self._h("USR-DRV"))
        self.assertEqual(res.status_code, 400)
        res = self.client.post("/api/community/posts", json={"body": "x" * 1001}, headers=self._h("USR-DRV"))
        self.assertEqual(res.status_code, 400)
        res = self.client.get("/api/community/posts")
        self.assertEqual(res.status_code, 401)

    def test_delete_rules(self):
        post_id = self.client.post("/api/community/posts", json={"body": "Mine"}, headers=self._h("USR-ADMIN")).get_json()["post"]["id"]
        res = self.client.delete(f"/api/community/posts/{post_id}", headers=self._h("USR-DRV"))
        self.assertEqual(res.status_code, 403)
        res = self.client.delete(f"/api/community/posts/{post_id}", headers=self._h("USR-ADMIN"))
        self.assertEqual(res.status_code, 200)

    # ── Wellness check-in ──────────────────────────────────────────────────

    def _answers(self, **over):
        base = {"sleep": "7_plus", "alertness": "awake", "awake_hours": "under_12", "factors": ["none"]}
        base.update(over)
        return base

    def test_low_risk_checkin_does_not_alert(self):
        res = self.client.post("/api/wellness/checkins", json={"answers": self._answers()}, headers=self._h("USR-DRV"))
        self.assertEqual(res.status_code, 201)
        body = res.get_json()
        self.assertEqual(body["risk_level"], "low")
        self.assertFalse(body["dispatcher_notified"])
        latest = self.client.get("/api/wellness/checkins/latest", headers=self._h("USR-DRV")).get_json()
        self.assertEqual(latest["checkin"]["id"], body["checkin"]["id"])

    def test_high_risk_checkin_raises_fatigue_alert(self):
        m = self.models
        res = self.client.post(
            "/api/wellness/checkins",
            json={"answers": self._answers(alertness="very_tired", factors=["medication", "none"])},
            headers=self._h("USR-DRV"),
        )
        body = res.get_json()
        self.assertEqual(body["risk_level"], "high")
        self.assertTrue(body["dispatcher_notified"])
        self.assertEqual(body["checkin"]["answers"]["factors"], ["medication"])

        db = m.SessionLocal()
        try:
            alert = db.query(m.Alert).filter(m.Alert.company_id == "CMP-A", m.Alert.type == "fatigue").order_by(m.Alert.created_at.desc()).first()
            self.assertEqual(alert.severity, "critical")
            self.assertEqual(alert.driver_id, "DRV-1")
            self.assertIn("Struggling to stay awake", alert.message)
        finally:
            db.close()

    def test_medium_risk_scoring(self):
        res = self.client.post("/api/wellness/checkins", json={"answers": self._answers(sleep="5_to_6", factors=["hungry"])}, headers=self._h("USR-DRV"))
        self.assertEqual(res.get_json()["risk_level"], "medium")

    def test_checkin_validation_and_admin_list(self):
        res = self.client.post("/api/wellness/checkins", json={"answers": {"sleep": "7_plus"}}, headers=self._h("USR-DRV"))
        self.assertEqual(res.status_code, 400)
        res = self.client.post("/api/wellness/checkins", json={"answers": self._answers(sleep="lots")}, headers=self._h("USR-DRV"))
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.get("/api/wellness/checkins", headers=self._h("USR-DRV")).status_code, 403)
        rows = self.client.get("/api/wellness/checkins", headers=self._h("USR-ADMIN")).get_json()["checkins"]
        self.assertTrue(all(r["driver_id"] in ("DRV-1", None) for r in rows))
        questions = self.client.get("/api/wellness/questions", headers=self._h("USR-DRV")).get_json()["questions"]
        self.assertNotIn("weight", questions[0]["options"][0])


if __name__ == "__main__":
    unittest.main()

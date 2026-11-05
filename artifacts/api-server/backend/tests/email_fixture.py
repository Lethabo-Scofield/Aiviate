"""Shared fixture for the email-agent tests: the real Flask app on a throwaway SQLite file,
a fake Gmail/Google and a fake LLM over real HTTP, and two companies with separate admins."""
import importlib
import os
import sys
import tempfile

from tests.fakes import FakeGoogle, FakeLLM

_FRESH = ("app", "models", "middleware", "utils", "config")
_FRESH_PREFIXES = ("routes", "integrations", "intelligence", "agents")

ENV_KEYS = (
    "DATABASE_URL", "NEON_DATABASE_URL", "JWT_SECRET", "AIVIATE_INTEGRATION_SECRET", "GMAIL_API_BASE",
    "GOOGLE_TOKEN_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OPENAI_API_KEY", "OPENAI_API_BASE",
    "GOOGLE_API_KEY", "GEMINI_API_KEY", "APP_ENV", "VERCEL_ENV", "WEBSITE_SITE_NAME", "REPLIT_DEPLOYMENT",
    "SKIP_DB_INIT", "EMAIL_SENDS_PER_HOUR", "EMAIL_DRAFT_TTL_HOURS",
)

SEND_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"]
READ_ONLY_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


class EmailFixture:
    """Mix into a unittest.TestCase."""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        cls._saved_env = {k: os.environ.get(k) for k in ENV_KEYS}
        cls.google = FakeGoogle().start()
        cls.llm = FakeLLM().start()

        for key in ("NEON_DATABASE_URL", "GOOGLE_API_KEY", "GEMINI_API_KEY", "APP_ENV", "VERCEL_ENV",
                    "WEBSITE_SITE_NAME", "REPLIT_DEPLOYMENT", "SKIP_DB_INIT", "EMAIL_SENDS_PER_HOUR",
                    "EMAIL_DRAFT_TTL_HOURS"):
            os.environ.pop(key, None)
        os.environ.update(
            DATABASE_URL=f"sqlite:///{os.path.join(cls._tmp.name, 'email.db')}",
            JWT_SECRET="email-test-jwt-secret-0123456789abcdef",
            AIVIATE_INTEGRATION_SECRET="email-test-token-secret-0123456789abcdef",
            GMAIL_API_BASE=cls.google.gmail_base, GOOGLE_TOKEN_URL=cls.google.token_url,
            GOOGLE_CLIENT_ID="test-client-id", GOOGLE_CLIENT_SECRET="test-client-secret",
            OPENAI_API_KEY="sk-test-not-a-real-key", OPENAI_API_BASE=cls.llm.openai_base,
        )

        # Load our own copy of the app, and put the originals back afterwards so other test
        # files (which hold references to, and patch, the original modules) are unaffected.
        cls._saved_modules = {}
        for name in list(sys.modules):
            if name in _FRESH or name.split(".")[0] in _FRESH_PREFIXES:
                cls._saved_modules[name] = sys.modules.pop(name)
        cls.app_module = importlib.import_module("app")
        cls.models = importlib.import_module("models")
        cls.utils = importlib.import_module("utils")
        cls.client = cls.app_module.create_app().test_client()

        m = cls.models
        db = m.SessionLocal()
        db.add_all([m.Company(id="CMP-A", name="Alpha Logistics"), m.Company(id="CMP-B", name="Beta Freight")])
        db.flush()
        users = [
            m.User(id="USR-ADMIN-A", email="admin@alpha.test", password_hash="x", name="Ada", role="admin", company_id="CMP-A"),
            m.User(id="USR-OPER-A", email="oper@alpha.test", password_hash="x", name="Olu", role="operator", company_id="CMP-A"),
            m.User(id="USR-ADMIN-B", email="admin@beta.test", password_hash="x", name="Ben", role="admin", company_id="CMP-B"),
        ]
        db.add_all(users)
        db.commit()
        token = cls.utils.generate_token
        cls.admin_a = {"Authorization": "Bearer " + token(users[0])}
        cls.operator_a = {"Authorization": "Bearer " + token(users[1])}
        cls.admin_b = {"Authorization": "Bearer " + token(users[2])}
        db.close()

    @classmethod
    def tearDownClass(cls):
        cls.google.stop()
        cls.llm.stop()
        cls.models.engine.dispose()
        for name in list(sys.modules):
            if name in _FRESH or name.split(".")[0] in _FRESH_PREFIXES:
                sys.modules.pop(name)
        sys.modules.update(cls._saved_modules)
        for key, value in cls._saved_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        cls._tmp.cleanup()

    def setUp(self):
        self.google.reset()
        self.llm.reset()
        m = self.models
        db = m.SessionLocal()
        db.query(m.EmailDraft).delete()
        db.query(m.IntegrationConnection).delete()
        db.add_all([
            m.IntegrationConnection(
                id="INT-A", company_id="CMP-A", provider="gmail", provider_user_email="dispatch@alpha.test",
                display_name="Alpha", access_token=m.protect_integration_token("good-access"),
                refresh_token=m.protect_integration_token("refresh-token-alpha"), scopes=list(SEND_SCOPES),
            ),
            m.IntegrationConnection(
                id="INT-B", company_id="CMP-B", provider="gmail", provider_user_email="ops@beta.test",
                display_name="Beta", access_token=m.protect_integration_token("good-access"),
                refresh_token=m.protect_integration_token("refresh-token-beta"), scopes=list(SEND_SCOPES),
            ),
        ])
        db.commit()
        db.close()

    # ---- helpers ----
    def msg(self, message_id="m1", sender="Acme Supplies <orders@acme.test>", subject="Dispatch status for AV-2041",
            body="Hi, order AV-2041 is confirmed and will ship on Friday. Please confirm the delivery window.", **kw):
        self.google.add_message(message_id, sender, subject, body, **kw)
        return message_id

    def db_rows(self, model, **filters):
        db = self.models.SessionLocal()
        try:
            return db.query(model).filter_by(**filters).all()
        finally:
            db.close()

    def create_draft(self, message_id="m1", body="Thanks, Friday works.", headers=None, **extra):
        return self.client.post("/api/integrations/gmail/drafts", headers=headers or self.admin_a,
                                json={"message_id": message_id, "body": body, **extra})

    def approve(self, draft_id, revision, headers=None):
        return self.client.post(f"/api/integrations/gmail/drafts/{draft_id}/approve",
                                headers=headers or self.admin_a, json={"revision": revision})

    def set_connection(self, **fields):
        db = self.models.SessionLocal()
        db.query(self.models.IntegrationConnection).filter_by(id="INT-A").update(fields)
        db.commit()
        db.close()

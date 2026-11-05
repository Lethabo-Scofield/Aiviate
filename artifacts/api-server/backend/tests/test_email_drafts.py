"""Reply drafts and the approval step, end to end over real HTTP against a fake Gmail.

Run from the backend/ directory:
    PYTHONPATH=. python -m unittest tests.test_email_drafts -v
"""
import base64
import contextlib
import io
import json
import os
import threading
import unittest
from datetime import timedelta
from unittest import mock

from tests.email_fixture import READ_ONLY_SCOPES, EmailFixture

PATH = "/api/integrations/gmail"


class DraftCreationTests(EmailFixture, unittest.TestCase):
    def test_a_draft_takes_its_recipient_from_the_original_email_and_sends_nothing(self):
        self.msg("m1", sender="Acme Supplies <orders@acme.test>")
        res = self.create_draft("m1", "Thanks, Friday works.")
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        draft = res.get_json()["draft"]
        self.assertEqual(draft["recipient"], "orders@acme.test")
        self.assertEqual(draft["subject"], "Re: Dispatch status for AV-2041")
        self.assertEqual((draft["status"], draft["revision"], draft["author"]), ("pending", 1, "user"))
        self.assertEqual(draft["source"]["from"], "Acme Supplies <orders@acme.test>")
        self.assertEqual(self.google.sent, [])                      # drafting never emails anyone
        self.assertEqual(len(self.db_rows(self.models.EmailDraft)), 1)

    def test_reply_to_is_honoured_and_a_client_cannot_choose_the_recipient(self):
        self.msg("m1", sender="Acme <orders@acme.test>", reply_to="Ops Desk <ops@acme.test>")
        res = self.create_draft("m1", "Hello", to="attacker@evil.test", recipient="attacker@evil.test",
                                subject="Totally different", cc="attacker@evil.test")
        draft = res.get_json()["draft"]
        self.assertEqual(draft["recipient"], "ops@acme.test")
        self.assertEqual(draft["subject"], "Re: Dispatch status for AV-2041")
        self.assertNotIn("attacker", json.dumps(draft))

    def test_bad_input_is_rejected(self):
        self.msg("m1")
        for body in ("", "   ", "x" * 10001, "has a \x00 null", None, 123):
            self.assertEqual(self.create_draft("m1", body).status_code, 400, repr(body)[:30])
        for message_id in ("", "has space", "../../etc", "a" * 300, None):
            self.assertEqual(self.create_draft(message_id, "ok").status_code, 400, repr(message_id))
        self.assertEqual(self.google.sent, [])

    def test_it_will_not_reply_to_its_own_mailbox_or_to_a_message_that_does_not_exist(self):
        self.msg("m1", sender="Dispatch <dispatch@alpha.test>")
        res = self.create_draft("m1", "ok")
        self.assertEqual(res.status_code, 400)
        self.assertIn("itself", res.get_json()["error"])
        self.assertEqual(self.create_draft("nope", "ok").status_code, 404)

    def test_a_read_only_connection_cannot_draft(self):
        self.msg("m1")
        self.set_connection(scopes=READ_ONLY_SCOPES)
        res = self.create_draft("m1", "ok")
        self.assertEqual(res.status_code, 403)
        self.assertIn("read-only", res.get_json()["error"])

    def test_no_connection_is_a_clear_error(self):
        self.msg("m1")
        db = self.models.SessionLocal()
        db.query(self.models.IntegrationConnection).filter_by(company_id="CMP-A").delete()
        db.commit(); db.close()
        self.assertEqual(self.create_draft("m1", "ok").status_code, 404)

    def test_a_newer_draft_replaces_the_one_still_waiting(self):
        self.msg("m1")
        first = self.create_draft("m1", "first").get_json()["draft"]
        second = self.create_draft("m1", "second").get_json()["draft"]
        listing = self.client.get(f"{PATH}/drafts", headers=self.admin_a).get_json()["drafts"]
        self.assertEqual([d["id"] for d in listing], [second["id"]])
        self.assertEqual(self.db_rows(self.models.EmailDraft, id=first["id"])[0].status, "discarded")

    def test_only_a_limited_number_of_drafts_can_wait(self):
        from integrations import drafts
        with mock.patch.object(drafts, "MAX_PENDING", 2):
            for i in range(3):
                self.msg(f"m{i}")
            self.assertEqual(self.create_draft("m0", "a").status_code, 201)
            self.assertEqual(self.create_draft("m1", "b").status_code, 201)
            self.assertEqual(self.create_draft("m2", "c").status_code, 409)


class ApprovalTests(EmailFixture, unittest.TestCase):
    def draft(self, body="Thanks, Friday works.", message_id="m1", **msg_kw):
        self.msg(message_id, **msg_kw)
        return self.create_draft(message_id, body).get_json()["draft"]

    def test_approving_sends_exactly_that_text_to_the_original_sender_once(self):
        draft = self.draft()
        res = self.approve(draft["id"], draft["revision"])
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        self.assertTrue(res.get_json()["ok"])
        self.assertEqual(res.get_json()["draft"]["status"], "sent")

        self.assertEqual(len(self.google.sent), 1)
        sent = self.google.sent[0]
        self.assertEqual(sent["to"], "orders@acme.test")
        self.assertEqual(sent["body"], "Thanks, Friday works.")
        self.assertEqual(sent["in_reply_to"], "<m1@mail.example>")      # threaded as a reply
        self.assertEqual(sent["thread_id"], "thread-m1")
        self.assertEqual(sent["token"], "Bearer good-access")           # this company's own connection

        row = self.db_rows(self.models.EmailDraft, id=draft["id"])[0]
        self.assertEqual((row.status, row.sent_message_id, row.approved_by), ("sent", "sent-1", "admin@alpha.test"))

        again = self.approve(draft["id"], draft["revision"])
        self.assertEqual(again.status_code, 409)                        # a second click can't send a second email
        self.assertEqual(len(self.google.sent), 1)

    def test_approval_must_name_the_revision_the_person_saw(self):
        draft = self.draft()
        missing = self.client.post(f"{PATH}/drafts/{draft['id']}/approve", headers=self.admin_a, json={})
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(self.approve(draft["id"], 99).status_code, 409)
        self.assertEqual(self.google.sent, [])

    def test_editing_invalidates_earlier_approval_and_the_edited_text_is_what_is_sent(self):
        draft = self.draft("original text")
        edited = self.client.patch(f"{PATH}/drafts/{draft['id']}", headers=self.admin_a,
                                   json={"body": "edited text", "revision": 1}).get_json()["draft"]
        self.assertEqual((edited["revision"], edited["body"]), (2, "edited text"))
        stale = self.approve(draft["id"], 1)
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(self.google.sent, [])
        self.assertEqual(self.approve(draft["id"], 2).status_code, 200)
        self.assertEqual(self.google.sent[0]["body"], "edited text")

    def test_a_stale_edit_does_not_overwrite_a_newer_one(self):
        draft = self.draft()
        self.client.patch(f"{PATH}/drafts/{draft['id']}", headers=self.admin_a, json={"body": "one", "revision": 1})
        stale = self.client.patch(f"{PATH}/drafts/{draft['id']}", headers=self.admin_a, json={"body": "two", "revision": 1})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(self.db_rows(self.models.EmailDraft, id=draft["id"])[0].body, "one")

    def test_a_sent_or_discarded_draft_cannot_be_edited_or_discarded_or_resent(self):
        sent = self.draft(message_id="m1")
        self.approve(sent["id"], 1)
        gone = self.draft(message_id="m2")
        self.assertEqual(self.client.post(f"{PATH}/drafts/{gone['id']}/discard", headers=self.admin_a).status_code, 200)
        for draft_id in (sent["id"], gone["id"]):
            self.assertEqual(self.client.patch(f"{PATH}/drafts/{draft_id}", headers=self.admin_a,
                                               json={"body": "x", "revision": 1}).status_code, 409)
            self.assertEqual(self.client.post(f"{PATH}/drafts/{draft_id}/discard", headers=self.admin_a).status_code, 409)
            self.assertEqual(self.approve(draft_id, 1).status_code, 409)
        self.assertEqual(len(self.google.sent), 1)

    def test_simultaneous_approvals_send_exactly_one_email(self):
        draft = self.draft()
        codes = []

        def click():
            client = self.client.application.test_client()
            res = client.post(f"{PATH}/drafts/{draft['id']}/approve", headers=self.admin_a, json={"revision": 1})
            codes.append(res.status_code)

        threads = [threading.Thread(target=click) for _ in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(codes.count(200), 1, codes)
        self.assertEqual(len(self.google.sent), 1)

    def test_an_expired_draft_cannot_be_approved(self):
        draft = self.draft()
        db = self.models.SessionLocal()
        db.query(self.models.EmailDraft).update({"expires_at": self.models.naive_utcnow() - timedelta(minutes=1)})
        db.commit(); db.close()
        res = self.approve(draft["id"], 1)
        self.assertEqual(res.status_code, 409)
        self.assertIn("expired", res.get_json()["error"])
        self.assertEqual(self.client.get(f"{PATH}/drafts", headers=self.admin_a).get_json()["drafts"], [])
        self.assertEqual(self.google.sent, [])

    def test_if_the_original_senders_address_changes_before_sending_nothing_is_sent(self):
        draft = self.draft()
        self.google.set_header("m1", "From", "Mallory <mallory@evil.test>")
        res = self.approve(draft["id"], 1)
        self.assertEqual(res.status_code, 400)
        self.assertIn("address changed", res.get_json()["error"])
        self.assertEqual(self.google.sent, [])
        self.assertEqual(self.db_rows(self.models.EmailDraft, id=draft["id"])[0].status, "failed")

    def test_the_hourly_send_limit_holds(self):
        with mock.patch.dict(os.environ, {"EMAIL_SENDS_PER_HOUR": "2"}):
            ids = []
            for i in range(3):
                ids.append(self.draft(message_id=f"m{i}", sender=f"S{i} <s{i}@acme.test>")["id"])
            codes = [self.approve(i, 1).status_code for i in ids]
        self.assertEqual(codes, [200, 200, 429])
        self.assertEqual(len(self.google.sent), 2)

    def test_an_expired_access_token_is_refreshed_and_saved_encrypted(self):
        draft = self.draft()
        self.google.valid_tokens = set()                 # Google now rejects the stored access token
        res = self.approve(draft["id"], 1)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        self.assertEqual(self.google.token_calls, 1)
        self.assertEqual(self.google.sent[0]["token"], "Bearer fresh-access")
        stored = self.db_rows(self.models.IntegrationConnection, id="INT-A")[0].access_token
        self.assertTrue(stored.startswith("enc1:"))
        self.assertNotIn("fresh-access", stored)
        self.assertEqual(self.models.reveal_integration_token(stored), "fresh-access")


class SendFailureTests(EmailFixture, unittest.TestCase):
    def draft(self):
        self.msg("m1")
        return self.create_draft("m1", "Hello there").get_json()["draft"]

    def test_google_refusing_the_send_leaves_the_draft_waiting_and_retryable(self):
        draft = self.draft()
        self.google.send_mode = "forbidden"
        res = self.approve(draft["id"], 1)
        self.assertEqual(res.status_code, 403)
        row = self.db_rows(self.models.EmailDraft, id=draft["id"])[0]
        self.assertEqual(row.status, "pending")
        self.assertIn("403", row.last_error)
        self.assertEqual(self.google.sent, [])
        self.google.send_mode = "ok"                     # permission fixed
        self.assertEqual(self.approve(draft["id"], 1).status_code, 200)
        self.assertEqual(len(self.google.sent), 1)

    def test_an_unconfirmed_send_is_never_retried_automatically(self):
        for mode in ("error", "hangup"):
            self.setUp()
            draft = self.draft()
            self.google.send_mode = mode
            res = self.approve(draft["id"], 1)
            self.assertEqual(res.status_code, 502, mode)
            self.assertIn("Check Sent", res.get_json()["error"])
            self.assertEqual(self.db_rows(self.models.EmailDraft, id=draft["id"])[0].status, "unknown")
            self.google.send_mode = "ok"
            self.assertEqual(self.approve(draft["id"], 1).status_code, 409, mode)   # no blind second attempt
            self.assertEqual(self.google.sent, [])

    def test_a_connection_that_has_lost_access_asks_to_reconnect(self):
        draft = self.draft()
        self.set_connection(access_token="enc1:not-a-valid-token")
        res = self.approve(draft["id"], 1)
        self.assertEqual(res.status_code, 401)
        self.assertIn("Reconnect", res.get_json()["error"])
        self.assertEqual(self.db_rows(self.models.EmailDraft, id=draft["id"])[0].status, "pending")


class AccessControlTests(EmailFixture, unittest.TestCase):
    def test_other_companies_and_non_admins_cannot_touch_a_draft(self):
        self.msg("m1")
        draft = self.create_draft("m1", "private reply").get_json()["draft"]
        did = draft["id"]

        # another company's admin sees and can do nothing with it
        self.assertEqual(self.client.get(f"{PATH}/drafts", headers=self.admin_b).get_json()["drafts"], [])
        self.assertEqual(self.client.patch(f"{PATH}/drafts/{did}", headers=self.admin_b, json={"body": "x", "revision": 1}).status_code, 404)
        self.assertEqual(self.approve(did, 1, headers=self.admin_b).status_code, 404)
        self.assertEqual(self.client.post(f"{PATH}/drafts/{did}/discard", headers=self.admin_b).status_code, 404)

        # same company, but not an admin
        for call in (
            lambda: self.create_draft("m1", "x", headers=self.operator_a),
            lambda: self.client.get(f"{PATH}/drafts", headers=self.operator_a),
            lambda: self.approve(did, 1, headers=self.operator_a),
        ):
            self.assertEqual(call().status_code, 403)
        # not signed in
        self.assertEqual(self.client.get(f"{PATH}/drafts").status_code, 401)
        self.assertEqual(self.client.post(f"{PATH}/drafts/{did}/approve", json={"revision": 1}).status_code, 401)

        self.assertEqual(self.google.sent, [])
        self.assertEqual(self.db_rows(self.models.EmailDraft, id=did)[0].status, "pending")

    def test_each_company_sends_through_its_own_connection(self):
        self.msg("m1")
        a = self.create_draft("m1", "from alpha").get_json()["draft"]
        b = self.create_draft("m1", "from beta", headers=self.admin_b).get_json()["draft"]
        self.db_rows(self.models.EmailDraft)
        self.google.valid_tokens = {"good-access"}
        self.approve(a["id"], 1)
        self.approve(b["id"], 1, headers=self.admin_b)
        self.assertEqual(len(self.google.sent), 2)
        mailboxes = {self.models.reveal_integration_token(c.access_token) for c in self.db_rows(self.models.IntegrationConnection)}
        self.assertEqual(mailboxes, {"good-access"})
        senders = {r.company_id for r in self.db_rows(self.models.EmailDraft)}
        self.assertEqual(senders, {"CMP-A", "CMP-B"})


class AuditAndSecretsTests(EmailFixture, unittest.TestCase):
    def test_every_step_is_audited_without_the_message_text(self):
        self.msg("m1")
        draft = self.create_draft("m1", "SECRET-BODY-TEXT").get_json()["draft"]
        self.client.patch(f"{PATH}/drafts/{draft['id']}", headers=self.admin_a, json={"body": "SECRET-EDIT-TEXT", "revision": 1})
        self.approve(draft["id"], 2)
        entries = self.db_rows(self.models.AuditLog, company_id="CMP-A")
        actions = {e.action_type for e in entries}
        for expected in ("email_draft_created", "email_draft_edited", "email_draft_approved", "email_reply_sent"):
            self.assertIn(expected, actions)
        blob = json.dumps([[e.summary, e.details] for e in entries])
        self.assertNotIn("SECRET-BODY-TEXT", blob)
        self.assertNotIn("SECRET-EDIT-TEXT", blob)
        self.assertIn("orders@acme.test", blob)          # who it went to is recorded

    def test_no_response_or_log_line_contains_a_google_token(self):
        self.msg("m1")
        out, err = io.StringIO(), io.StringIO()
        bodies = []
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            draft = self.create_draft("m1", "hello"); bodies.append(draft.get_data(as_text=True))
            did = draft.get_json()["draft"]["id"]
            self.google.send_mode = "forbidden"
            bodies.append(self.approve(did, 1).get_data(as_text=True))
            self.google.send_mode = "error"
            bodies.append(self.approve(did, 1).get_data(as_text=True))
            bodies.append(self.client.get(f"{PATH}/drafts?status=", headers=self.admin_a).get_data(as_text=True))
            bodies.append(self.client.post(f"{PATH}/search", headers=self.admin_a, json={"query": "x"}).get_data(as_text=True))
        everything = "\n".join(bodies) + out.getvalue() + err.getvalue()
        for secret in ("good-access", "refresh-token-alpha", "test-client-secret", "enc1:"):
            self.assertNotIn(secret, everything, secret)

    def test_search_results_are_capped(self):
        self.msg("m1")
        res = self.client.post(f"{PATH}/search", headers=self.admin_a, json={"query": "x", "max_results": 100000})
        self.assertEqual(res.status_code, 200)
        listing = [path for method, path, _t in self.google.requests if method == "GET" and "maxResults" in path]
        self.assertIn("maxResults=25", listing[-1])

    def test_the_old_send_anything_endpoint_is_gone(self):
        self.msg("m1")
        res = self.client.post(f"{PATH}/reply", headers=self.admin_a, json={"message_id": "m1", "body": "sneaky"})
        self.assertIn(res.status_code, (404, 405))
        self.assertEqual(self.google.sent, [])


class TokenProtectionTests(EmailFixture, unittest.TestCase):
    def legacy(self, plaintext):
        key = os.environ["AIVIATE_INTEGRATION_SECRET"].encode()
        return base64.b64encode(bytes(b ^ key[i % len(key)] for i, b in enumerate(plaintext.encode()))).decode()

    def test_tokens_are_encrypted_with_fresh_randomness(self):
        m = self.models
        first, second = m.protect_integration_token("ya29.secret"), m.protect_integration_token("ya29.secret")
        self.assertNotEqual(first, second)
        self.assertTrue(first.startswith("enc1:"))
        self.assertNotIn("ya29.secret", first)
        self.assertEqual(m.reveal_integration_token(first), "ya29.secret")
        self.assertIsNone(m.protect_integration_token(None))

    def test_tampered_or_wrong_key_values_are_rejected(self):
        m = self.models
        good = m.protect_integration_token("ya29.secret")
        tampered = good[:-4] + ("AAAA" if not good.endswith("AAAA") else "BBBB")
        with self.assertRaises(m.IntegrationTokenError):
            m.reveal_integration_token(tampered)
        with mock.patch.dict(os.environ, {"AIVIATE_INTEGRATION_SECRET": "a-completely-different-secret-value"}):
            with self.assertRaises(m.IntegrationTokenError):
                m.reveal_integration_token(good)

    def test_production_refuses_to_protect_tokens_without_a_real_secret(self):
        m = self.models
        with mock.patch.dict(os.environ, {"APP_ENV": "production"}):
            os.environ.pop("AIVIATE_INTEGRATION_SECRET", None); os.environ.pop("JWT_SECRET", None)
            with self.assertRaises(m.IntegrationTokenError):
                m.protect_integration_token("ya29.secret")

    def test_old_masked_tokens_still_work_and_are_upgraded_on_first_use(self):
        self.set_connection(access_token=self.legacy("good-access"), refresh_token=self.legacy("refresh-token-alpha"))
        self.assertTrue(self.models.is_legacy_integration_token(self.db_rows(self.models.IntegrationConnection, id="INT-A")[0].access_token))
        res = self.client.post(f"{PATH}/search", headers=self.admin_a, json={"query": "x"})
        self.assertEqual(res.status_code, 200)
        row = self.db_rows(self.models.IntegrationConnection, id="INT-A")[0]
        self.assertTrue(row.access_token.startswith("enc1:") and row.refresh_token.startswith("enc1:"))
        self.assertEqual(self.models.reveal_integration_token(row.access_token), "good-access")
        self.assertEqual(self.models.reveal_integration_token(row.refresh_token), "refresh-token-alpha")

    def test_an_unreadable_stored_token_asks_for_a_reconnect_instead_of_crashing(self):
        self.set_connection(access_token="enc1:garbage")
        res = self.client.post(f"{PATH}/search", headers=self.admin_a, json={"query": "x"})
        self.assertEqual(res.status_code, 401)
        self.assertIn("Reconnect", res.get_json()["error"])


if __name__ == "__main__":
    unittest.main()

import base64
from email import message_from_bytes
import unittest
from unittest.mock import Mock, patch

import requests

from integrations.gmail_service import (
    GmailReauthorizationRequired,
    build_google_oauth_url,
    build_gmail_reply,
    build_search_query,
    extract_message_summary,
    fetch_gmail_messages_with_refresh,
    gmail_api_error_summary,
    send_gmail_reply_with_refresh,
    summarize_confirmation_messages,
)


class GmailIntegrationTests(unittest.TestCase):
    def test_build_google_oauth_url_contains_required_params(self):
        url = build_google_oauth_url(
            company_id="cmp_123",
            redirect_uri="https://app.example.com/integrations/gmail/callback",
            client_id="google-client-id",
        )
        self.assertIn("https://accounts.google.com/o/oauth2/v2/auth", url)
        self.assertIn("client_id=google-client-id", url)
        self.assertIn("scope=", url)
        self.assertIn("state=", url)
        self.assertIn("gmail.send", url)

    def test_build_search_query_keeps_order_context(self):
        query = build_search_query("AV-2041", "Acme Supplies")
        self.assertIn("AV-2041", query)
        self.assertIn("Acme Supplies", query)
        self.assertIn("in:inbox", query.lower())

    def test_extract_message_summary_handles_headers(self):
        payload = {
            "id": "msg_1",
            "snippet": "Shipment confirmed",
            "payload": {
                "headers": [
                    {"name": "Subject", "value": "Order AV-2041 confirmed"},
                    {"name": "From", "value": "supplier@example.com"},
                    {"name": "Date", "value": "Mon, 1 Jan 2024 09:00:00 +0000"},
                ],
                "body": {"data": "V29sZCwgSSBoYXZlIGNvbmZpcm1lZCBvcmRlciBAVi0yMDQx"},
            },
        }
        item = extract_message_summary(payload)
        self.assertEqual(item["subject"], "Order AV-2041 confirmed")
        self.assertEqual(item["from"], "supplier@example.com")
        self.assertEqual(item["reply_to"], "supplier@example.com")
        self.assertIn("confirmed", item["body_preview"].lower())

    def test_summarize_confirmation_messages_identifies_supplier_confirmation(self):
        messages = [
            {
                "id": "msg_1",
                "subject": "Order AIV-1042 confirmed",
                "from": "supplier@bulkmart.co",
                "snippet": "We have confirmed the order and scheduled dispatch for AIV-1042.",
                "body_preview": "We have confirmed the order and scheduled dispatch for AIV-1042.",
            }
        ]
        result = summarize_confirmation_messages(messages, order_ref="AIV-1042")
        self.assertIsNotNone(result)
        self.assertIn("confirmed", result["summary"].lower())
        self.assertIn("AIV-1042", result["summary"])

    @patch("integrations.gmail_service.requests.post")
    @patch("integrations.gmail_service.fetch_gmail_messages")
    def test_expired_access_token_is_refreshed_and_retried(self, fetch_messages, post):
        unauthorized = requests.Response()
        unauthorized.status_code = 401
        fetch_messages.side_effect = [
            requests.HTTPError(response=unauthorized),
            [{"id": "msg-1"}],
        ]
        token_response = Mock()
        token_response.content = b'{"access_token":"new-access"}'
        token_response.status_code = 200
        token_response.json.return_value = {"access_token": "new-access"}
        post.return_value = token_response

        with patch.dict("os.environ", {
            "GOOGLE_CLIENT_ID": "client-id",
            "GOOGLE_CLIENT_SECRET": "client-secret",
        }):
            messages, token = fetch_gmail_messages_with_refresh(
                "expired-access", "stored-refresh", '"AIV-1042"'
            )

        self.assertEqual(messages, [{"id": "msg-1"}])
        self.assertEqual(token, "new-access")
        self.assertEqual(fetch_messages.call_count, 2)
        self.assertEqual(post.call_args.kwargs["data"]["grant_type"], "refresh_token")

    @patch("integrations.gmail_service.fetch_gmail_messages")
    def test_expired_access_without_refresh_token_requires_reauthorization(self, fetch_messages):
        unauthorized = requests.Response()
        unauthorized.status_code = 401
        fetch_messages.side_effect = requests.HTTPError(response=unauthorized)

        with self.assertRaises(GmailReauthorizationRequired):
            fetch_gmail_messages_with_refresh("expired-access", None, '"AIV-1042"')

    @patch("integrations.gmail_service.get_message_details")
    @patch("integrations.gmail_service.requests.get")
    def test_message_detail_401_is_propagated_for_refresh(self, get_request, get_details):
        listing = Mock()
        listing.status_code = 200
        listing.json.return_value = {"messages": [{"id": "msg-1"}]}
        get_request.return_value = listing
        unauthorized = requests.Response()
        unauthorized.status_code = 401
        get_details.side_effect = requests.HTTPError(response=unauthorized)

        with self.assertRaises(requests.HTTPError):
            from integrations.gmail_service import fetch_gmail_messages
            fetch_gmail_messages("expired-access", '"AIV-1042"')

    def test_gmail_api_403_reason_has_actionable_guidance(self):
        response = requests.Response()
        response.status_code = 403
        response._content = (
            b'{"error":{"message":"Gmail API has not been used in project.",'
            b'"errors":[{"reason":"accessNotConfigured"}]}}'
        )
        summary = gmail_api_error_summary(requests.HTTPError(response=response))
        self.assertIn("Gmail API is disabled", summary)

    def test_missing_gmail_scope_has_reconnect_guidance(self):
        response = requests.Response()
        response.status_code = 403
        response._content = (
            b'{"error":{"message":"Insufficient Permission",'
            b'"errors":[{"reason":"insufficientPermissions"}]}}'
        )
        summary = gmail_api_error_summary(requests.HTTPError(response=response))
        self.assertIn("gmail.readonly", summary)
        self.assertIn("gmail.send", summary)

    def test_build_reply_uses_reply_to_and_original_thread_headers(self):
        source = {
            "threadId": "thread-123",
            "payload": {
                "headers": [
                    {"name": "From", "value": "Supplier <orders@example.com>"},
                    {"name": "Reply-To", "value": "Replies <reply@example.com>"},
                    {"name": "Subject", "value": "Dispatch status"},
                    {"name": "Message-ID", "value": "<original@example.com>"},
                    {"name": "References", "value": "<older@example.com>"},
                ]
            },
        }
        reply = build_gmail_reply(source, "Thanks\nPlease confirm.", "dispatch@example.net")
        message = message_from_bytes(base64.urlsafe_b64decode(reply["raw"] + "==="))

        self.assertEqual(reply["recipient"], "reply@example.com")
        self.assertEqual(reply["subject"], "Re: Dispatch status")
        self.assertEqual(reply["thread_id"], "thread-123")
        self.assertEqual(message["In-Reply-To"], "<original@example.com>")
        self.assertEqual(
            message["References"], "<older@example.com> <original@example.com>"
        )
        self.assertEqual(message.get_payload().replace("\r\n", "\n").strip(), "Thanks\nPlease confirm.")

    def test_reply_recipient_falls_back_to_from_when_reply_to_is_invalid(self):
        source = {
            "payload": {
                "headers": [
                    {"name": "From", "value": "Supplier <orders@example.com>"},
                    {"name": "Reply-To", "value": "not-an-email"},
                ]
            }
        }
        reply = build_gmail_reply(source, "Thanks", "dispatch@example.net")
        self.assertEqual(reply["recipient"], "orders@example.com")

    def test_build_reply_rejects_self_address_and_header_injection(self):
        self_addressed = {
            "payload": {
                "headers": [
                    {"name": "From", "value": "dispatch@example.net"},
                    {"name": "Subject", "value": "Hello"},
                ]
            }
        }
        with self.assertRaisesRegex(ValueError, "itself"):
            build_gmail_reply(self_addressed, "Reply", "dispatch@example.net")

        injected_subject = {
            "payload": {
                "headers": [
                    {"name": "From", "value": "supplier@example.com"},
                    {"name": "Subject", "value": "Hello\r\nBcc: victim@example.com"},
                ]
            }
        }
        with self.assertRaisesRegex(ValueError, "Subject"):
            build_gmail_reply(injected_subject, "Reply", "dispatch@example.net")

    @patch("integrations.gmail_service.requests.post")
    @patch("integrations.gmail_service.get_message_details")
    def test_send_reply_posts_threaded_mime_using_source_recipient(self, get_details, post):
        get_details.return_value = {
            "threadId": "thread-123",
            "payload": {
                "headers": [
                    {"name": "From", "value": "Supplier <orders@example.com>"},
                    {"name": "Subject", "value": "Dispatch status"},
                    {"name": "Message-ID", "value": "<original@example.com>"},
                ]
            },
        }
        response = Mock()
        response.json.return_value = {"id": "sent-456", "threadId": "thread-123"}
        post.return_value = response

        result, token = send_gmail_reply_with_refresh(
            "access-token",
            "refresh-token",
            "source-123",
            "Thanks",
            "dispatch@example.net",
        )

        request_body = post.call_args.kwargs["json"]
        self.assertEqual(post.call_args.args[0].rsplit("/", 1)[-1], "send")
        self.assertEqual(request_body["threadId"], "thread-123")
        sent_mime = message_from_bytes(
            base64.urlsafe_b64decode(request_body["raw"] + "===")
        )
        self.assertEqual(sent_mime["To"], "orders@example.com")
        self.assertEqual(result["id"], "sent-456")
        self.assertEqual(result["recipient"], "orders@example.com")
        self.assertEqual(token, "access-token")


if __name__ == "__main__":
    unittest.main()

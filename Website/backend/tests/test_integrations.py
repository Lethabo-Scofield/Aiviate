import unittest

from integrations.gmail_service import (
    build_google_oauth_url,
    build_search_query,
    extract_message_summary,
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


if __name__ == "__main__":
    unittest.main()

"""Read-only sample records for integrations that are not connected.

These never enter the operational database and must never be used to plan,
dispatch, message customers, or claim that a third-party account is linked.
Gmail is deliberately absent: it has a real OAuth-backed integration.
"""

import re


DEMO_INTEGRATIONS = [
    {
        "provider": "shopify",
        "name": "Shopify",
        "description": "Sample store orders and fulfillment status.",
        "prompts": ["Show me Shopify sample orders", "Resolve a Shopify sample order issue"],
        "scenario": {
            "issue": "Sample order #S-1043 is missing an apartment number.",
            "check": "Checking the sample delivery note for a unit reference.",
            "resolution": "Unit 4 appears in the sample note. The sample order can be reviewed with the completed address; no live order was changed.",
        },
        "records": [
            {"label": "Sample order #S-1042", "detail": "2 items · ready to pack", "meta": "R 1,240"},
            {"label": "Sample order #S-1043", "detail": "1 item · awaiting fulfillment", "meta": "R 690"},
        ],
    },
    {
        "provider": "woocommerce",
        "name": "WooCommerce",
        "description": "Sample web-store orders awaiting dispatch.",
        "prompts": ["Show me WooCommerce sample orders", "Handle a WooCommerce sample delivery issue"],
        "scenario": {
            "issue": "Sample order #W-209 has a collection window that overlaps another pickup.",
            "check": "Comparing the sample collection windows.",
            "resolution": "A later collection slot is suggested in the sample schedule; no store order was updated.",
        },
        "records": [
            {"label": "Sample order #W-208", "detail": "3 items · processing", "meta": "R 980"},
            {"label": "Sample order #W-209", "detail": "1 item · ready for collection", "meta": "R 350"},
        ],
    },
    {
        "provider": "whatsapp",
        "name": "WhatsApp",
        "description": "Sample customer delivery conversations. No messages are sent.",
        "prompts": ["Show me WhatsApp sample conversations", "Resolve a WhatsApp sample delivery request"],
        "scenario": {
            "issue": "Sample conversation A asks for an afternoon delivery instead.",
            "check": "Checking the sample route's available afternoon window.",
            "resolution": "A 14:00–16:00 window and a draft reply are suggested. No WhatsApp message was sent.",
        },
        "records": [
            {"label": "Sample conversation A", "detail": "Customer asks for an afternoon delivery window.", "meta": "Unread"},
            {"label": "Sample conversation B", "detail": "Customer confirms someone will be home.", "meta": "Replied"},
        ],
    },
    {
        "provider": "teams",
        "name": "Microsoft Teams",
        "description": "Sample operations-channel updates. Nothing is posted.",
        "prompts": ["Show me Teams sample updates", "Handle a Teams sample dispatch issue"],
        "scenario": {
            "issue": "A sample route is missing a driver in the sample operations channel.",
            "check": "Comparing the sample available-driver list.",
            "resolution": "A replacement-driver suggestion and a draft update are prepared. Nothing was posted to Teams.",
        },
        "records": [
            {"label": "#dispatch · Sample alert", "detail": "Route needs a replacement driver.", "meta": "10:24"},
            {"label": "#operations · Sample briefing", "detail": "Morning dispatch summary is ready.", "meta": "08:15"},
        ],
    },
    {
        "provider": "quickbooks",
        "name": "QuickBooks",
        "description": "Sample invoices and payment references.",
        "prompts": ["Show me QuickBooks sample invoices", "Resolve a QuickBooks sample invoice issue"],
        "scenario": {
            "issue": "Sample invoice QB-301 has an unmatched delivery fee.",
            "check": "Comparing the sample invoice and delivery reference.",
            "resolution": "A reconciliation note is drafted for review. No invoice or payment was changed.",
        },
        "records": [
            {"label": "Sample invoice QB-301", "detail": "Delivery services · unpaid", "meta": "R 2,450"},
            {"label": "Sample invoice QB-302", "detail": "Delivery services · paid", "meta": "R 1,180"},
        ],
    },
    {
        "provider": "xero",
        "name": "Xero",
        "description": "Sample accounting contacts and invoice status.",
        "prompts": ["Show me Xero sample invoices", "Handle a Xero sample payment issue"],
        "scenario": {
            "issue": "Sample invoice XE-087 is awaiting payment.",
            "check": "Checking the sample due date and contact record.",
            "resolution": "A follow-up reminder is drafted for review. No payment was collected or reminder sent.",
        },
        "records": [
            {"label": "Sample invoice XE-087", "detail": "Fleet delivery · awaiting payment", "meta": "R 3,200"},
            {"label": "Sample invoice XE-088", "detail": "Fleet delivery · paid", "meta": "R 760"},
        ],
    },
    {
        "provider": "sage",
        "name": "Sage",
        "description": "Sample delivery-cost reconciliation.",
        "prompts": ["Show me Sage sample batches", "Resolve a Sage sample reconciliation issue"],
        "scenario": {
            "issue": "Sample batch SG-12 has three unmatched delivery charges.",
            "check": "Matching sample delivery references against the batch.",
            "resolution": "Five charges match; three are flagged for manual review. No accounting records were changed.",
        },
        "records": [
            {"label": "Sample batch SG-12", "detail": "8 deliveries · reconciliation pending", "meta": "R 4,100"},
            {"label": "Sample batch SG-13", "detail": "5 deliveries · reconciled", "meta": "R 2,560"},
        ],
    },
    {
        "provider": "zoho",
        "name": "Zoho",
        "description": "Sample CRM and inventory context.",
        "prompts": ["Show me Zoho sample records", "Handle a Zoho sample stock issue"],
        "scenario": {
            "issue": "Sample stock item ZH-42 is running low.",
            "check": "Comparing the sample balance with the reorder threshold.",
            "resolution": "A reorder recommendation is prepared for review. No purchase order was placed.",
        },
        "records": [
            {"label": "Sample contact ZH-41", "detail": "Wholesale account · delivery requested", "meta": "CRM"},
            {"label": "Sample stock item ZH-42", "detail": "Packaging material · low stock", "meta": "Inventory"},
        ],
    },
    {
        "provider": "olyxee",
        "name": "Olyxee Logistics",
        "description": "Sample fleet updates, not live vehicle tracking.",
        "prompts": ["Show me Olyxee sample fleet updates", "Resolve an Olyxee sample vehicle issue"],
        "scenario": {
            "issue": "Sample vehicle FL-12 is scheduled for maintenance.",
            "check": "Checking the sample fleet for another available vehicle.",
            "resolution": "Sample vehicle FL-07 is suggested as an alternative. No live fleet assignment changed.",
        },
        "records": [
            {"label": "Sample vehicle FL-07", "detail": "Available for dispatch", "meta": "Depot"},
            {"label": "Sample vehicle FL-12", "detail": "Scheduled for maintenance", "meta": "Tomorrow"},
        ],
    },
    {
        "provider": "custom-api",
        "name": "Custom API",
        "description": "Sample order payloads, not an active API connection.",
        "prompts": ["Show me Custom API sample payloads", "Handle a Custom API sample payload issue"],
        "scenario": {
            "issue": "Sample payload API-102 has no delivery address.",
            "check": "Validating the required address field in the sample payload.",
            "resolution": "The payload is flagged for correction before import. No operational order was created.",
        },
        "records": [
            {"label": "Sample payload API-101", "detail": "Order accepted · address provided", "meta": "JSON"},
            {"label": "Sample payload API-102", "detail": "Order pending · address missing", "meta": "JSON"},
        ],
    },
]


def demo_command_for(text):
    """Answer named provider questions without consulting or mutating live data."""
    lowered = (text or "").lower()
    aliases = {
        "teams": r"\b(?:microsoft\s+)?teams\b",
        "olyxee": r"\bolyxee\b",
        "custom-api": r"\bcustom\s+api\b",
    }
    for demo in DEMO_INTEGRATIONS:
        pattern = aliases.get(demo["provider"], rf"\b{re.escape(demo['provider'])}\b")
        if not re.search(pattern, lowered):
            continue
        if (
            re.search(r"\b(connect|configure|send|post|sync|import|assign|pay|reply)\b", lowered)
            or re.search(r"\bdispatch\b(?!\s+(?:issue|alerts?|updates?|summary|data|workflow|status)\b)", lowered)
        ):
            return {
                "ok": False,
                "demo": True,
                "summary": f"{demo['name']} is available for sample-data exploration only. No account is connected, and I cannot perform actions with its sample data. Gmail is the only live third-party integration.",
            }
        result = {
            "ok": True,
            "type": "demo_integration",
            "demo": True,
            "provider": demo["name"],
            "summary": f"These are sample {demo['name']} records, not live data. Nothing has been imported or sent.",
            "items": demo["records"],
        }
        if re.search(r"\b(fix|solve|resolve|handle|challenge|problem|issue|exception)\b", lowered):
            result["scenario"] = demo["scenario"]
            result["summary"] = f"Sample {demo['name']} issue reviewed. No live system was changed."
        return result
    return None
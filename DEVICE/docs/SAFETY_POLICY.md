# Safety Policy

Status: planned only.

Device observations can create safety signals. Safety signals may create suspected incidents when policy thresholds are met. Confirmed incidents require corroboration by configured rules, human review or independent operational evidence.

Development and automated tests must never call real public emergency numbers. Outbound safety calls may only be requested by APP after an incident policy approves the recipient, message and permitted disclosure fields.

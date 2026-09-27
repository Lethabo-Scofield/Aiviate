"""Aiviate intelligence layer.

Each module accepts structured input and returns structured output. They
contain no LLM calls and no I/O — they are pure functions over data the
routes layer fetches. This keeps them testable in isolation and replaceable
with ML models later without changing call sites.
"""

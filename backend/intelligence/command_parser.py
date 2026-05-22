"""Deterministic intent parser for the operator command palette.

No LLM. Recognizes a small, explicit command set; returns `{intent, args}`
on success and `{error}` on anything it cannot parse. Easy to extend; easy
to test; predictable cost.
"""
import shlex
from typing import Dict, List


COMMANDS: Dict[str, Dict] = {
    "help":            {"argc": 0, "desc": "List all commands"},
    "drivers":         {"argc": 0, "desc": "List drivers and status"},
    "jobs":            {"argc": 0, "desc": "List jobs and their assignments"},
    "map":             {"argc": 0, "desc": "Show all active routes on a map"},
    "route":           {"argc": 1, "desc": "route <job_id>  — show one route on a map"},
    "alerts":          {"argc": 0, "desc": "List open unread alerts"},
    "recommendations": {"argc": 0, "desc": "List active recommendations"},
    "audit":           {"argc": 0, "desc": "Show the last 10 audit entries"},
    "stats":           {"argc": 0, "desc": "Snapshot of key counts"},
    "assign":          {"argc": 2, "desc": "assign <job_id> <driver_id>  (auto-optimizes + notifies driver)"},
    "unassign":        {"argc": 1, "desc": "unassign <job_id>"},
    "optimize":        {"argc": 1, "desc": "optimize <job_id>  |  optimize all  (notifies driver on changes)"},
    "block":           {"argc": 1, "desc": "block <driver_id>"},
    "unblock":         {"argc": 1, "desc": "unblock <driver_id>"},
    "acknowledge":     {"argc": 1, "desc": "acknowledge <recommendation_id>"},
    "notify":          {"argc": 2, "desc": "notify <driver_id> <message…>  — send an alert to a driver"},
}

ALIASES = {
    "recs": "recommendations",
    "ack": "acknowledge",
    "ls": "jobs",
    "show": "route",
}


def parse(text: str) -> Dict:
    if not text or not text.strip():
        return {"error": "Empty command — try `help`"}
    try:
        parts = shlex.split(text.strip())
    except ValueError as exc:
        return {"error": f"Could not parse: {exc}"}

    head = parts[0].lower()
    args = parts[1:]
    intent = ALIASES.get(head, head)

    if intent not in COMMANDS:
        return {"error": f"Unknown command `{head}` — try `help`"}

    # `optimize all` is a distinct intent
    if intent == "optimize" and len(args) == 1 and args[0].lower() == "all":
        return {"intent": "optimize_all", "args": []}

    expected = COMMANDS[intent]["argc"]
    if len(args) < expected:
        return {"error": f"`{intent}` needs {expected} argument(s) — see `help`"}

    # `notify` is variadic in the message portion: keep arg[0] as driver_id
    # and join the rest as the message body.
    if intent == "notify":
        return {"intent": intent, "args": [args[0], " ".join(args[1:])]}

    return {"intent": intent, "args": args[:expected] if expected > 0 else []}


def help_entries() -> List[Dict]:
    return [{"command": k, "description": v["desc"]} for k, v in COMMANDS.items()]

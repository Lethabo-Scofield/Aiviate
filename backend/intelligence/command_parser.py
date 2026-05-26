"""Deterministic intent parser for the operator command palette.

No LLM. Recognizes a small, explicit command set; returns `{intent, args}`
on success and `{error}` on anything it cannot parse. Easy to extend; easy
to test; predictable cost.
"""
import shlex
from typing import Dict, List


COMMANDS: Dict[str, Dict] = {
    "greeting":        {"argc": 0, "desc": "Say hello and explain what Aiviate can do"},
    "help":            {"argc": 0, "desc": "List all commands"},
    "autopilot":       {"argc": 0, "desc": "Show Autopilot status"},
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


def _safe_split(text: str) -> List[str]:
    """shlex.split, but tolerant of unbalanced apostrophes from natural input.

    Conversational phrases ("today's", "who's") use apostrophes that shlex
    interprets as quote characters. If shlex chokes, fall back to a simple
    whitespace split so the parser can still produce a useful intent.
    """
    try:
        return shlex.split(text)
    except ValueError:
        return text.split()


def parse(text: str) -> Dict:
    if not text or not text.strip():
        return {"error": "Empty command — try `help`"}
    parts = _safe_split(text.strip())
    if not parts:
        return {"error": "Empty command — try `help`"}

    head = parts[0].lower()
    args = parts[1:]
    intent = ALIASES.get(head, head)

    if intent not in COMMANDS:
        if intent == "autopilot" and args:
            sub = args[0].lower()
            if sub == "run":
                return {"intent": "autopilot_run", "args": []}
            if sub in ("on", "off"):
                return {"intent": "autopilot_update", "args": [sub]}
            if sub == "mode" and len(args) >= 2:
                return {"intent": "autopilot_update", "args": ["mode", args[1].lower()]}
        return {"error": f"Unknown command `{head}` — try `help`"}

    if intent == "autopilot" and args:
        sub = args[0].lower()
        if sub == "run":
            return {"intent": "autopilot_run", "args": []}
        if sub in ("on", "off"):
            return {"intent": "autopilot_update", "args": [sub]}
        if sub == "mode" and len(args) >= 2:
            return {"intent": "autopilot_update", "args": ["mode", args[1].lower()]}

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


# Friendly examples surfaced in the UI — phrasing that the natural-language
# layer understands, grouped by what the user is trying to do.
FRIENDLY_EXAMPLES: List[Dict] = [
    {"phrase": "hy",                            "does": "Starts a normal Aiviate conversation"},
    {"phrase": "autopilot status",              "does": "Shows whether Autopilot is running and what needs approval"},
    {"phrase": "turn autopilot on",             "does": "Enables autonomous operations"},
    {"phrase": "run autopilot now",             "does": "Runs one immediate operational check"},
    {"phrase": "show me today's routes",         "does": "Pops up a live map of every active route"},
    {"phrase": "what jobs do I have?",           "does": "Lists today's jobs and who's on each one"},
    {"phrase": "who's working?",                 "does": "Shows your drivers and their status"},
    {"phrase": "any problems?",                  "does": "Surfaces open alerts that need attention"},
    {"phrase": "how are we doing?",              "does": "Quick snapshot of jobs, drivers, and alerts"},
    {"phrase": "what should I do?",              "does": "Lists the system's current recommendations"},
    {"phrase": "show route j-1",                 "does": "Puts a single route on the map"},
    {"phrase": "give j-1 to Mike",               "does": "Assigns the job and notifies the driver"},
    {"phrase": "fix all routes",                 "does": "Re-optimizes every active route"},
    {"phrase": "tell Mike to hurry up",          "does": "Sends an in-app message to that driver"},
    {"phrase": "block Sarah",                    "does": "Pauses a driver from new assignments"},
]


def friendly_examples() -> List[Dict]:
    return list(FRIENDLY_EXAMPLES)

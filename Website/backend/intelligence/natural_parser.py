"""Natural-language normalizer for the Ask-Aiviate input.

Translates conversational phrasing into the deterministic command grammar
the executor already understands. No LLM. Pure regex + synonym tables, so
behavior is predictable and auditable.

The normalizer returns a *cleaned command string* that is then fed to the
existing command_parser. If no pattern matches, the original text is
returned and command_parser will reject it with its usual error.
"""
import re
from typing import List, Tuple

# Contraction tolerance helpers — used inline below.
#   today's, today s, todays  →  today'?s
#   who's, whos                →  who'?s
#   what's, whats              →  what'?s
#   how's, hows                →  how'?s

# Order matters: more specific patterns first.
_PATTERNS: List[Tuple[re.Pattern, object]] = [
    # ── greetings / casual openers ─────────────────────────────────────────
    (re.compile(r"^\s*(hi|hy|hey|hello|yo|sup|howzit|sawubona)\s*\??\s*$", re.I), "greeting"),

    # ── help ─────────────────────────────────────────────────────────
    (re.compile(r"^\s*\??\s*(help|what can you do|what do you do|how does this work)\s*\??\s*$", re.I), "help"),

    # ── autopilot ─────────────────────────────────────────────────────
    (re.compile(r"^\s*(agent\s*zero|agentzero|aiviate)[,:\s]+.*?(full\s+)?details?.*?(completed\s+)?(autopilot|auto\s*pilot).*?(task|action|work).*$", re.I), "autopilot"),
    (re.compile(r"^\s*(show|give|open|explain|tell)\b.*?(full\s+)?details?.*?(completed\s+)?(autopilot|auto\s*pilot).*?(task|action|work).*$", re.I), "autopilot"),
    (re.compile(r"^\s*(autopilot|auto\s*pilot)\s*\??\s*$", re.I), "autopilot"),
    (re.compile(r"^\s*(autopilot|auto\s*pilot)\s+(status|state|overview|summary)\s*\??\s*$", re.I), "autopilot"),
    (re.compile(r"^\s*(what\s+(has|did)\s+)?(autopilot|auto\s*pilot)\s+(done|handled|do)\s*\??\s*$", re.I), "audit"),
    (re.compile(r"^\s*(run|start|check)\s+(autopilot|auto\s*pilot)(\s+now)?\s*\??\s*$", re.I), "autopilot run"),
    (re.compile(r"^\s*(turn|switch|set)\s+(autopilot|auto\s*pilot)\s+on\s*$", re.I), "autopilot on"),
    (re.compile(r"^\s*(turn|switch|set)\s+(autopilot|auto\s*pilot)\s+off\s*$", re.I), "autopilot off"),
    (re.compile(r"^\s*(set\s+)?(autopilot|auto\s*pilot)\s+(to\s+)?(assist|autonomous|emergency|manual)\s*(mode)?\s*$", re.I),
     lambda m: f"autopilot mode {m.group(4).lower()}"),

    # ── single route on map (must come BEFORE generic map) ──────────
    (re.compile(r"^\s*(show|see|view|open|pull\s+up)\b[^\n]*?(route|job)\s+([\w-]+)", re.I),
     lambda m: f"route {m.group(3)}"),
    (re.compile(r"^\s*(route|job)\s+([\w-]+)\b.*?(on\s+(the\s+)?map)?\s*$", re.I),
     lambda m: f"route {m.group(2)}"),

    # ── map / live view ─────────────────────────────────────────────
    (re.compile(
        r"^\s*(show|see|view|give\s+me|where\s+are)\b[^\n]*?"
        r"(map|live|active\s+routes?|today'?s\s+routes?|routes?|drivers?\s+(now|currently)|"
        r"what'?s\s+on\s+the\s+road|on\s+the\s+road)",
        re.I), "map"),
    (re.compile(r"^\s*(map|live\s*map|today'?s\s+routes?|active\s+routes?|what'?s\s+happening)\s*\??\s*$", re.I), "map"),
    (re.compile(r"^\s*what'?s\s+on\s+the\s+road\s*\??\s*$", re.I), "map"),

    # ── jobs / deliveries list ──────────────────────────────────────
    (re.compile(r"^\s*(show|see|list|view|give\s+me)\b[^\n]*?(jobs?|deliveries|orders?)\b.*?$", re.I), "jobs"),
    (re.compile(r"^\s*what(\s+jobs?|\s+deliveries|\s+orders?)\b.*?$", re.I), "jobs"),
    (re.compile(r"^\s*(my\s+|today'?s\s+)?(jobs?|deliveries|orders?)\s*$", re.I), "jobs"),

    # ── drivers list ────────────────────────────────────────────────
    (re.compile(r"^\s*who'?s\s+(working|on|available|free|out|here|around)\s*\??\s*$", re.I), "drivers"),
    (re.compile(r"^\s*who\s+is\s+(working|on|available|free|out|here|around)\s*\??\s*$", re.I), "drivers"),
    (re.compile(r"^\s*(show|see|list|view|give\s+me)\b[^\n]*?(drivers?|team|crew)\b.*?$", re.I), "drivers"),
    (re.compile(r"^\s*(my\s+)?(drivers?|team|crew)\s*\??\s*$", re.I), "drivers"),

    # ── alerts / problems ───────────────────────────────────────────
    (re.compile(r"^\s*(any|what'?s|show|see)\b[^\n]*?(alerts?|problems?|issues?|wrong|broken|going\s+wrong)\b.*?$", re.I), "alerts"),
    (re.compile(r"^\s*(alerts?|problems?|issues?)\s*\??\s*$", re.I), "alerts"),

    # ── stats / summary ─────────────────────────────────────────────
    (re.compile(r"^\s*(give\s+me\s+(a\s+)?|the\s+)?(summary|overview|snapshot|stats?|status)\s*\??\s*$", re.I), "stats"),
    (re.compile(r"^\s*how('?s|\s+are|\s+is|\s+re)\s+(it|we|things|today|the\s+day|business)\b.*?$", re.I), "stats"),
    (re.compile(r"^\s*how\s+goes\s+it\s*\??\s*$", re.I), "stats"),

    # ── recommendations ─────────────────────────────────────────────
    (re.compile(r"^\s*(what\s+should\s+i\s+do|any\s+(suggestions?|ideas?|recommendations?|recs?)|suggestions?|ideas?|recommendations?|recs?)\s*\??\s*$", re.I), "recommendations"),

    # ── audit ───────────────────────────────────────────────────────
    (re.compile(r"^\s*(what\s+(just\s+)?happened|recent\s+(activity|actions?)|audit|history)\s*\??\s*$", re.I), "audit"),

    # ── plan & dispatch (build routes from stops + auto-assign) ─────
    #   Must come BEFORE "optimize all" so "plan and assign everything"
    #   routes to a full dispatch rather than a re-optimize.
    #   Deliberately NARROW: only explicit "plan / dispatch / auto-assign"
    #   phrasing may fire this (it is state-changing). Generic verbs like
    #   "run" or "show" are intentionally excluded so a read-only request
    #   such as "run jobs report" can never trigger a live dispatch.
    (re.compile(
        r"^\s*(plan|dispatch)\b[^\n]*?"
        r"(plan(?:ning)?|dispatch|route|delivery|deliveries|stops?|day|everything|jobs?|all)\b.*$",
        re.I), "dispatch"),
    (re.compile(r"^\s*(plan|dispatch)\s*(it|them|everything|all|now)?\s*$", re.I), "dispatch"),
    (re.compile(r"^\s*(build|create|make|generate)\b[^\n]*?(routes?|plan|day)\b.*$", re.I), "dispatch"),
    (re.compile(r"^\s*auto[\s-]*assign\b.*$", re.I), "dispatch"),
    # "assign all jobs", "assign everything" — anchored so a single
    # assignment like "assign j-1 to Mike" falls through to the assign rule.
    (re.compile(r"^\s*assign\s+(all|every)\s+(jobs?|routes?|deliveries|stops?)\s*$", re.I), "dispatch"),
    (re.compile(r"^\s*assign\s+everything\s*$", re.I), "dispatch"),

    # ── optimize all ────────────────────────────────────────────────
    (re.compile(r"^\s*(fix|optimize|tidy(\s+up)?|reorder|clean\s+up)\b[^\n]*?(all\s+(routes?|jobs?)|every\s+route|everything)\s*$", re.I), "optimize all"),
    (re.compile(r"^\s*(run|do)\b[^\n]*?optimi[sz][a-z]*\b[^\n]*?(all|every|everything|routes?)\s*$", re.I), "optimize all"),
    (re.compile(r"^\s*optimize\s+all\s*$", re.I), "optimize all"),

    # ── optimize single ─────────────────────────────────────────────
    (re.compile(r"^\s*(fix|optimize|reorder|tidy(\s+up)?)\b[^\n]*?(route|job)\s+([\w-]+)", re.I),
     lambda m: f"optimize {m.group(4)}"),
    (re.compile(r"^\s*optimize\s+([\w-]+)\s*$", re.I),
     lambda m: f"optimize {m.group(1)}"),

    # ── assign ──────────────────────────────────────────────────────
    # "assign job j-1 to Mike", "give j-1 to Mike", "hand j-1 to Mike"
    (re.compile(r"^\s*(assign|give|hand)\s+(?:job\s+)?([\w-]+)\s+to\s+(.+?)\s*$", re.I),
     lambda m: f'assign {m.group(2)} "{m.group(3).strip()}"'),
    # "put Mike on j-1", "have Mike take j-1"
    (re.compile(r"^\s*(put|have|let)\s+(.+?)\s+(?:on|take|do|handle)\s+(?:job\s+)?([\w-]+)\s*$", re.I),
     lambda m: f'assign {m.group(3)} "{m.group(2).strip()}"'),

    # ── unassign ────────────────────────────────────────────────────
    (re.compile(r"^\s*(unassign|remove|cancel)\s+(?:driver\s+from\s+)?(?:job\s+)?([\w-]+)\s*$", re.I),
     lambda m: f"unassign {m.group(2)}"),

    # ── notify / message a driver ──────────────────────────────────
    # "tell Mike to hurry up", "message Mike please slow down"
    # Driver token is one word; multi-word names need IDs (documented limitation).
    (re.compile(r"^\s*(tell|message|notify|ping|alert)\s+(\S+?)\s*[:,]?\s+(.+?)\s*$", re.I),
     lambda m: f'notify {m.group(2)} "{m.group(3).strip()}"'),
    # "let Mike know the route changed"
    (re.compile(r"^\s*let\s+(\S+?)\s+know\s+(?:that\s+)?(.+?)\s*$", re.I),
     lambda m: f'notify {m.group(1)} "{m.group(2).strip()}"'),

    # ── block / unblock ─────────────────────────────────────────────
    (re.compile(r"^\s*(block|pause|stop)\s+(?:driver\s+)?(.+?)\s*$", re.I),
     lambda m: f'block "{m.group(2).strip()}"'),
    (re.compile(r"^\s*(unblock|resume|allow|reactivate)\s+(?:driver\s+)?(.+?)\s*$", re.I),
     lambda m: f'unblock "{m.group(2).strip()}"'),

    # ── acknowledge ─────────────────────────────────────────────────
    (re.compile(r"^\s*(acknowledge|ack|dismiss|got\s+it\s+on)\s+(\S+)\s*$", re.I),
     lambda m: f"acknowledge {m.group(2)}"),
]


def normalize(text: str) -> str:
    """Translate friendly phrasing into the underlying command grammar.

    Returns the rewritten command string. If nothing matches, returns the
    original text unchanged (the command_parser will then reject it with
    its standard error).
    """
    if not text:
        return text
    raw = text.strip()
    # Strip a trailing punctuation so phrasing variants collapse.
    cleaned = raw.rstrip("?.! ")
    for pattern, repl in _PATTERNS:
        m = pattern.match(cleaned)
        if not m:
            continue
        if callable(repl):
            return repl(m)
        return repl
    return raw

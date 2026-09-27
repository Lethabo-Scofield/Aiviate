"""Agent base contract.

An agent is a small object with one responsibility. Given a context
(devices, events, drivers, jobs, alerts) it returns:
  - a list of AgentDecision   — concrete things it thinks should happen
  - an AgentStatus            — its own health/visibility for the UI

Agents MUST NOT call LLMs. All reasoning is algorithmic.
Agents MUST be honest: if they have no data to work with, they report
state="no_signal" with a `note` explaining what would need to be wired
to make them useful.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple


@dataclass
class AgentDecision:
    id: str
    agent: str
    kind: str
    category: str
    what: str
    why: str
    action: str
    expected_benefit: str
    confidence: float
    severity: str  # low | medium | high | critical
    subject_id: Optional[str] = None
    link: Optional[str] = None
    autonomous_safe: bool = False  # agent's opinion; Approval agent has final say
    requires_approval: bool = True  # set by Approval agent

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class AgentStatus:
    name: str
    responsibility: str
    state: str  # active | idle | no_signal | error
    decisions_emitted: int = 0
    last_decision_summary: Optional[str] = None
    note: Optional[str] = None
    last_run_at: Optional[str] = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    error: Optional[str] = None

    def to_dict(self) -> Dict:
        return asdict(self)


class BaseAgent:
    """Subclasses override `name`, `responsibility`, and `evaluate`."""

    name: str = "BaseAgent"
    responsibility: str = ""

    def evaluate(self, ctx: Dict) -> Tuple[List[AgentDecision], AgentStatus]:
        raise NotImplementedError

    # Helper for subclasses
    def _status(self, state: str, decisions: List[AgentDecision], note: Optional[str] = None,
                error: Optional[str] = None) -> AgentStatus:
        last = decisions[0].what if decisions else None
        return AgentStatus(
            name=self.name,
            responsibility=self.responsibility,
            state=state,
            decisions_emitted=len(decisions),
            last_decision_summary=last,
            note=note,
            error=error,
        )

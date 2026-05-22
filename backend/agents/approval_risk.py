"""Approval & Risk Agent.

Does not generate decisions of its own. After every other agent runs,
this one classifies each decision: should it be auto-executable, or
must a human approve it?

Policy (deterministic):
  - severity == critical             → always requires_approval
  - severity == high                 → requires_approval
  - severity in (medium, low) AND
       autonomous_safe AND
       confidence >= 0.85            → no approval needed
  - everything else                  → requires_approval
"""
from typing import Dict, List, Tuple

from agents.base import AgentDecision, AgentStatus, BaseAgent


class ApprovalRiskAgent(BaseAgent):
    name = "Approval & Risk"
    responsibility = "Classifies which decisions can run automatically vs need human approval."

    AUTO_CONFIDENCE_THRESHOLD = 0.85

    def evaluate(self, ctx: Dict) -> Tuple[List[AgentDecision], AgentStatus]:
        # Approval agent runs *after* the others; orchestrator calls
        # classify() directly. evaluate() is a no-op for symmetry.
        return [], self._status("idle", [], note="Runs after other agents")

    def classify(self, decisions: List[AgentDecision]) -> Tuple[List[AgentDecision], AgentStatus]:
        auto_count = 0
        for d in decisions:
            if d.severity in ("critical", "high"):
                d.requires_approval = True
            elif d.autonomous_safe and d.confidence >= self.AUTO_CONFIDENCE_THRESHOLD:
                d.requires_approval = False
                auto_count += 1
            else:
                d.requires_approval = True
        status = AgentStatus(
            name=self.name,
            responsibility=self.responsibility,
            state="active" if decisions else "idle",
            decisions_emitted=len(decisions),
            last_decision_summary=(f"Classified {len(decisions)} decision(s); "
                                   f"{auto_count} autonomous-safe, "
                                   f"{len(decisions) - auto_count} need approval"),
            note=(f"Policy: severity high/critical always requires approval; "
                  f"others only auto if confidence ≥ "
                  f"{int(self.AUTO_CONFIDENCE_THRESHOLD * 100)}%"),
        )
        return decisions, status

"""Delay Prediction Agent.

Wraps delay_risk.score_delay_risk over ETAs produced by the ETA agent.
Today the ETA agent reports no_signal (per-stop inputs not stored), so
this agent has nothing to score. It says so honestly.
"""
from typing import Dict, List, Tuple

from agents.base import AgentDecision, AgentStatus, BaseAgent


class DelayPredictionAgent(BaseAgent):
    name = "Delay Prediction"
    responsibility = "Predicts which stops are at risk of late arrival."

    def evaluate(self, ctx: Dict) -> Tuple[List[AgentDecision], AgentStatus]:
        etas = ctx.get("_etas") or []
        ctx["_delay_risks"] = []
        decisions: List[AgentDecision] = []
        if not etas:
            return decisions, self._status(
                "no_signal", decisions,
                note="Waiting on ETA Prediction signals (currently no input)",
            )
        return decisions, self._status("idle", decisions)

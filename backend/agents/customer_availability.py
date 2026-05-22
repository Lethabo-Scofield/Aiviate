"""Customer Availability Agent.

Designed to predict whether a customer will be present to receive
a delivery (using historical success windows, ack patterns, etc).
We do not currently store customer interaction history, so this
agent reports `no_signal` honestly rather than fabricate availability
windows. Once a customer_interactions table exists, swap in the
algorithm without changing the contract.
"""
from typing import Dict, List, Tuple

from agents.base import AgentDecision, AgentStatus, BaseAgent


class CustomerAvailabilityAgent(BaseAgent):
    name = "Customer Availability"
    responsibility = "Predicts whether the recipient will be available at the stop."

    def evaluate(self, ctx: Dict) -> Tuple[List[AgentDecision], AgentStatus]:
        decisions: List[AgentDecision] = []
        note = ("No customer interaction history is stored yet — this agent "
                "needs a customer_interactions table (delivery successes, "
                "failed attempts, ack timestamps) to start predicting.")
        return decisions, self._status("no_signal", decisions, note=note)

"""Customer Communication Agent.

Turns delay-risk signals into a concrete "notify the customer" decision.
We do not have an outbound SMS/email integration wired, so today the
action is to *queue* a notification for an operator to send. The agent
is honest about this.
"""
from typing import Dict, List, Tuple

from agents.base import AgentDecision, AgentStatus, BaseAgent


class CustomerCommunicationAgent(BaseAgent):
    name = "Customer Communication"
    responsibility = "Drafts proactive notifications to customers about delays."

    def evaluate(self, ctx: Dict) -> Tuple[List[AgentDecision], AgentStatus]:
        risks = ctx.get("_delay_risks") or []
        decisions: List[AgentDecision] = []
        for r in risks:
            if r.get("risk") not in ("medium", "high"):
                continue
            decisions.append(AgentDecision(
                id=f"notify:{r.get('stop_id')}",
                agent=self.name,
                kind="notify_customer",
                category="Customer",
                what=(f"Draft delay heads-up for "
                      f"{r.get('customer_name', 'customer')} "
                      f"(~{int(r.get('delay_minutes', 0))} min late)"),
                why=r.get("reason", "Stop is at risk of running over the promised window"),
                action="Operator-driven follow-up (no outbound SMS/email channel "
                       "is connected — agent surfaces drafts only)",
                expected_benefit="Reduces inbound complaints and reschedule churn",
                confidence=0.75,
                severity="medium",
                subject_id=r.get("stop_id"),
                link=None,
                autonomous_safe=False,  # cannot auto-send without an outbound channel
            ))
        note = ("No outbound SMS/email channel is connected — drafts are "
                "surfaced as recommendations for an operator to send manually.")
        if not risks:
            return decisions, self._status(
                "idle", decisions,
                note="Waiting on Delay Prediction signals; " + note,
            )
        return decisions, self._status(
            "active" if decisions else "idle", decisions, note=note,
        )

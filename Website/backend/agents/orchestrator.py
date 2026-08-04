"""Multi-agent orchestrator.

Builds an operational context once, dispatches it to every agent, then
hands the combined decision list to the Approval & Risk agent for
classification. Returns:
  - decisions: list[AgentDecision]  (tagged with agent + requires_approval)
  - statuses : list[AgentStatus]    (per-agent health, for the UI)

Errors in one agent never break the others — the orchestrator catches
exceptions and reports state="error" with the message.
"""
from __future__ import annotations

import traceback
from typing import Dict, List, Tuple

from agents.base import AgentDecision, AgentStatus, BaseAgent
from agents.approval_risk import ApprovalRiskAgent
from agents.customer_availability import CustomerAvailabilityAgent
from agents.customer_communication import CustomerCommunicationAgent
from agents.delay_prediction import DelayPredictionAgent
from agents.driver_assignment import DriverAssignmentAgent
from agents.eta_prediction import EtaPredictionAgent
from agents.rerouting import ReroutingAgent
from agents.route_optimization import RouteOptimizationAgent

# Order matters: ETA must run before Delay; Delay before Communication.
AGENT_REGISTRY: List[BaseAgent] = [
    RouteOptimizationAgent(),
    ReroutingAgent(),
    EtaPredictionAgent(),
    DelayPredictionAgent(),
    CustomerAvailabilityAgent(),
    CustomerCommunicationAgent(),
    DriverAssignmentAgent(),
]

APPROVAL_AGENT = ApprovalRiskAgent()


class Orchestrator:
    def run(self, ctx: Dict) -> Tuple[List[AgentDecision], List[AgentStatus]]:
        statuses: List[AgentStatus] = []
        all_decisions: List[AgentDecision] = []
        for agent in AGENT_REGISTRY:
            try:
                decisions, status = agent.evaluate(ctx)
            except Exception as exc:  # noqa: BLE001
                traceback.print_exc()
                decisions = []
                status = AgentStatus(
                    name=agent.name,
                    responsibility=agent.responsibility,
                    state="error",
                    decisions_emitted=0,
                    error=f"{type(exc).__name__}: {exc}",
                )
            statuses.append(status)
            all_decisions.extend(decisions)

        # Approval agent classifies everyone else's decisions.
        try:
            all_decisions, approval_status = APPROVAL_AGENT.classify(all_decisions)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            approval_status = AgentStatus(
                name=APPROVAL_AGENT.name,
                responsibility=APPROVAL_AGENT.responsibility,
                state="error",
                decisions_emitted=0,
                error=f"{type(exc).__name__}: {exc}",
            )
        statuses.append(approval_status)

        # Sort by severity then confidence — UI consumes in this order.
        sev_w = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        all_decisions.sort(
            key=lambda d: (sev_w.get(d.severity, 0), d.confidence),
            reverse=True,
        )
        return all_decisions, statuses

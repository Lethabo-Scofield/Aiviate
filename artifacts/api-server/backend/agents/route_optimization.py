"""Route Optimization Agent.

Looks at active jobs and flags any whose stop order is clearly
suboptimal. Calculation is delegated to the OR-Tools wrapper used
elsewhere — the agent only owns the *decision to surface it*.
"""
from typing import Dict, List, Tuple

from agents.base import AgentDecision, AgentStatus, BaseAgent


class RouteOptimizationAgent(BaseAgent):
    name = "Route Optimization"
    responsibility = "Reorders stops within each route to minimize distance."

    def evaluate(self, ctx: Dict) -> Tuple[List[AgentDecision], AgentStatus]:
        jobs = ctx.get("jobs", [])
        decisions: List[AgentDecision] = []
        candidates = [j for j in jobs if (j.get("total_stops") or 0) >= 3
                      and j.get("status") in ("assigned", "in_progress")]
        # Heuristic surface: if we have any active multi-stop route, expose
        # an explicit "consider re-optimization" decision — execution is one
        # click via the existing optimize command. We deliberately do not
        # invent savings numbers we cannot verify here.
        for j in candidates[:5]:
            decisions.append(AgentDecision(
                id=f"opt_review:{j['id']}",
                agent=self.name,
                kind="review_route",
                category="Routing",
                what=f"Route {j['id']} ({j.get('total_stops')} stops) is eligible for re-optimization",
                why="Stop order may have changed since the last optimization run",
                action=f"Run optimize {j['id']} to verify",
                expected_benefit="Potential distance reduction; verified by the optimizer",
                confidence=0.6,
                severity="low",
                subject_id=j["id"],
                link=None,
                autonomous_safe=False,  # we don't auto-rerun without operator intent
            ))
        if not jobs:
            return decisions, self._status("no_signal", decisions,
                                           note="No jobs in the system yet")
        return decisions, self._status("active" if decisions else "idle", decisions)

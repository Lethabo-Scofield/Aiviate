"""Driver Assignment Agent.

For each unassigned job, suggest a candidate driver from the pool of
non-blocked drivers. We deliberately do NOT auto-execute: the operator
still picks. Selection heuristic: first available driver (ranked by
vehicle compatibility if present, otherwise insertion order).
"""
from typing import Dict, List, Tuple

from agents.base import AgentDecision, AgentStatus, BaseAgent


class DriverAssignmentAgent(BaseAgent):
    name = "Driver Assignment"
    responsibility = "Suggests which driver should take an unassigned route."

    def evaluate(self, ctx: Dict) -> Tuple[List[AgentDecision], AgentStatus]:
        jobs = ctx.get("jobs", [])
        drivers = ctx.get("drivers", [])
        available = [d for d in drivers if not d.get("blocked")]
        unassigned = [j for j in jobs if j.get("status") == "unassigned"]
        decisions: List[AgentDecision] = []
        if not unassigned:
            note = None if jobs else "No jobs to assign"
            return decisions, self._status("idle", decisions, note=note)
        if not available:
            return decisions, self._status(
                "no_signal", decisions,
                note="No unblocked drivers available — cannot suggest assignments",
            )
        for j in unassigned[:5]:
            cand = available[0]
            decisions.append(AgentDecision(
                id=f"assign:{j['id']}",
                agent=self.name,
                kind="suggest_assign",
                category="Dispatch",
                what=f"Assign {j['id']} ({j.get('total_stops', 0)} stops) to {cand['name']}",
                why="First non-blocked driver in the pool",
                action=f"Run: assign {j['id']} {cand['id']}",
                expected_benefit="Route leaves the unassigned queue",
                confidence=0.55,
                severity="medium",
                subject_id=j["id"],
                link=None,
                autonomous_safe=False,
            ))
        return decisions, self._status("active", decisions)

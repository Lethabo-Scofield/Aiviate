"""Dynamic Rerouting Agent.

Detects situations that warrant changing a route mid-flight: blocked
roads, weather events, or driver going far off-route. Today we wire
the only signal we genuinely have: blocked drivers holding active
routes. Weather / traffic / GPS-deviation feeds are not wired and the
agent says so explicitly.
"""
from typing import Dict, List, Tuple

from agents.base import AgentDecision, AgentStatus, BaseAgent


class ReroutingAgent(BaseAgent):
    name = "Dynamic Rerouting"
    responsibility = "Reassigns or reroutes when a route becomes invalid mid-flight."

    def evaluate(self, ctx: Dict) -> Tuple[List[AgentDecision], AgentStatus]:
        drivers = {d["id"]: d for d in ctx.get("drivers", [])}
        decisions: List[AgentDecision] = []
        for j in ctx.get("jobs", []):
            if j.get("status") not in ("assigned", "in_progress"):
                continue
            drv = drivers.get(j.get("driver_id"))
            if drv and drv.get("blocked"):
                decisions.append(AgentDecision(
                    id=f"reroute:{j['id']}",
                    agent=self.name,
                    kind="reassign_route",
                    category="Routing",
                    what=f"Route {j['id']} held by blocked driver {drv.get('name')}",
                    why="Blocked driver cannot deliver, so the route is stranded",
                    action="Reassign route to another available driver",
                    expected_benefit="Prevents missed deliveries on this route",
                    confidence=0.95,
                    severity="high",
                    subject_id=j["id"],
                    link=None,
                    autonomous_safe=False,
                ))
        note = ("Weather, traffic, and GPS-deviation feeds are not wired. "
                "Only blocked-driver rerouting is active.")
        if not ctx.get("jobs"):
            return decisions, self._status("no_signal", decisions, note=note)
        return decisions, self._status(
            "active" if decisions else "idle", decisions, note=note,
        )

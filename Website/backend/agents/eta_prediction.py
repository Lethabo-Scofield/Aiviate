"""ETA Prediction Agent.

Wraps eta_predictor.predict_eta_minutes. To predict per-stop ETAs we
need (a) the distance from the previous stop and (b) the promised
delivery window. Neither is currently stored on the Stop model
(`distance_km` is at the job level only), so this agent is honest
about needing that wiring before it can emit anything useful.

When the data lands, swap the no_signal path for the real loop —
the contract does not change.
"""
from typing import Dict, List, Tuple

from agents.base import AgentDecision, AgentStatus, BaseAgent


class EtaPredictionAgent(BaseAgent):
    name = "ETA Prediction"
    responsibility = "Estimates arrival times for stops from telemetry and route data."

    def evaluate(self, ctx: Dict) -> Tuple[List[AgentDecision], AgentStatus]:
        stops = ctx.get("stops", [])
        ctx["_etas"] = []  # downstream agents key off this
        decisions: List[AgentDecision] = []
        if not stops:
            return decisions, self._status(
                "no_signal", decisions,
                note="No stops in the system to predict ETAs for",
            )
        return decisions, self._status(
            "no_signal", decisions,
            note=("Per-stop distance and promised window are not stored on "
                  "the Stop model yet — the predictor is wired but has no "
                  "inputs. Add distance_from_prev and promised_minutes "
                  "to enable."),
        )

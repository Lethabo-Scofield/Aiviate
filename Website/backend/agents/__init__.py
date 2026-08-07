"""Multi-agent layer.

Each agent owns one operational responsibility and uses deterministic
algorithms (no LLM) to produce decisions. The orchestrator dispatches
operational context to every agent, gathers their decisions, lets the
Approval & Risk agent classify which are autonomous-safe, and returns
the combined result to the HTTP surface.
"""
from .orchestrator import Orchestrator, AGENT_REGISTRY  # noqa: F401
from .base import AgentDecision, AgentStatus  # noqa: F401

"""Honest stubs for modules whose real implementation is pending.

Each stub documents its required inputs and outputs so the contract is
discoverable, but raises NotImplementedError to make accidental use loud
rather than silently returning bogus data.
"""
from typing import Dict, List


def assign_driver(job: Dict, candidates: List[Dict]) -> Dict:
    """Pick the best driver for a job.

    Inputs:
      job: {lat, lng, time_window_start, time_window_end, demand, ...}
      candidates: [{driver_id, location, available, vehicle_type,
                    safety_score, current_load, ...}]
    Returns:
      {driver_id, backup_driver_id, confidence, reason}

    STUB — requires live driver locations to be streamed before it can be
    implemented honestly. Currently the system has only seed-based positions.
    """
    raise NotImplementedError(
        "driver_assignment: pending — needs live driver location stream"
    )


def notify_customer(stop: Dict, channel: str, message: str) -> Dict:
    """Send a customer message via SMS / email / WhatsApp / voice.

    STUB — wire to Twilio (SMS, voice) or SendGrid (email) before enabling.
    Until then, recommendations of kind "notify_customer" remain
    approval-required so a human carries out the action.
    """
    raise NotImplementedError(
        "customer_comms: pending — no messaging provider configured"
    )


def recommend_reroute(job: Dict, current_route: List, trigger: str) -> Dict:
    """Decide whether to keep, recommend, or auto-apply a reroute.

    STUB — depends on driver_assignment (for re-handoff candidates) and a
    live traffic feed (for the trigger evaluation). Both are pending.
    """
    raise NotImplementedError(
        "dynamic_rerouter: pending — depends on driver_assignment + traffic feed"
    )

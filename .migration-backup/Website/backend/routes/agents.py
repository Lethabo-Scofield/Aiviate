"""Multi-agent HTTP surface.

GET /api/agents — roster of all agents with live status + combined
                  decision list (already classified by Approval & Risk).
"""
from datetime import datetime, timezone

from flask import g, jsonify

from agents import Orchestrator
from agents.context import build_context
from middleware import require_admin, require_auth
from routes import agents_bp
from utils import get_db_session


@agents_bp.route("/api/agents", methods=["GET"])
@require_auth
@require_admin
def list_agents():
    db = get_db_session()
    try:
        ctx = build_context(db, g.company_id)
        decisions, statuses = Orchestrator().run(ctx)
        return jsonify({
            "agents": [s.to_dict() for s in statuses],
            "decisions": [d.to_dict() for d in decisions],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })
    finally:
        db.close()

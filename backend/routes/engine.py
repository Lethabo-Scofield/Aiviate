import traceback

from flask import jsonify, g

from routes import engine_bp
from middleware import require_auth, require_admin
from models import Stop
from utils import get_db_session
import engine_client


@engine_bp.route("/api/engine/status", methods=["GET"])
@require_auth
def engine_status():
    return jsonify({"available": engine_client.health()})


@engine_bp.route("/api/engine/optimize", methods=["POST"])
@require_auth
@require_admin
def engine_optimize():
    company_id = g.company_id

    db = get_db_session()
    try:
        stops = db.query(Stop).filter(Stop.company_id == company_id).all()
        stops_data = [s.to_dict() for s in stops]
    finally:
        db.close()

    try:
        result = engine_client.optimize_stops(stops_data)
        return jsonify(result)
    except engine_client.EngineError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "The AI Planner failed to produce a plan."}), 502

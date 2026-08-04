from flask import jsonify, g

from routes import stops_bp
from middleware import require_auth, require_admin
from models import Stop
from utils import get_db_session


@stops_bp.route("/api/stops", methods=["GET"])
@require_auth
@require_admin
def get_stops():
    db = get_db_session()
    try:
        stops = db.query(Stop).filter(Stop.company_id == g.company_id).all()
        return jsonify({"stops": [s.to_dict() for s in stops]})
    finally:
        db.close()

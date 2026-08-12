from flask import jsonify, g

from routes import stops_bp
from middleware import require_auth, require_admin
from models import Stop
from stop_totals import stop_display_totals, stop_to_dict_with_total
from utils import get_db_session


@stops_bp.route("/api/stops", methods=["GET"])
@require_auth
@require_admin
def get_stops():
    db = get_db_session()
    try:
        stops = db.query(Stop).filter(Stop.company_id == g.company_id).all()
        totals = stop_display_totals(db, company_id=g.company_id)
        return jsonify({"stops": [stop_to_dict_with_total(s, totals) for s in stops]})
    finally:
        db.close()

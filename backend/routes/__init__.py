from flask import Blueprint

auth_bp = Blueprint("auth", __name__)
jobs_bp = Blueprint("jobs", __name__)
drivers_bp = Blueprint("drivers", __name__)
stops_bp = Blueprint("stops", __name__)
optimization_bp = Blueprint("optimization", __name__)
stats_bp = Blueprint("stats", __name__)
safety_bp = Blueprint("safety", __name__)
devices_bp = Blueprint("devices", __name__)
alerts_bp = Blueprint("alerts", __name__)
liveops_bp = Blueprint("liveops", __name__)

from routes import auth, jobs, drivers, stops, optimization, stats, safety, devices, alerts, liveops, seed

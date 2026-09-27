import os
import sys
import traceback

from flask import Flask, jsonify

ROOT = os.path.dirname(os.path.dirname(__file__))
BACKEND = os.path.join(ROOT, "Website", "backend")

if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

os.environ.setdefault("SKIP_DB_INIT", "true")

try:
    from app import create_app  # noqa: E402

    app = create_app()
except Exception as startup_error:
    traceback.print_exc()
    startup_detail = f"{type(startup_error).__name__}: {startup_error}"
    app = Flask(__name__)

    @app.route("/api/health")
    def health_startup_error():
        return jsonify({
            "status": "error",
            "service": "Aiviate Dispatch API",
            "error": "API startup failed",
            "detail": startup_detail,
        }), 503

    @app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    def api_startup_error(_path):
        return jsonify({
            "error": "API startup failed",
            "detail": startup_detail,
        }), 503

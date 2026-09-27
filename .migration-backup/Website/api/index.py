import sys
import os
import traceback

from flask import Flask, jsonify

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

try:
    from app import create_app

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

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from flask import send_from_directory, abort
from app import create_app

app = create_app()

DIST_DIR = os.path.join(os.path.dirname(__file__), "dist")

if not os.path.isfile(os.path.join(DIST_DIR, "index.html")):
    raise RuntimeError(
        f"Frontend build not found at {DIST_DIR}/index.html. "
        "Run 'npm run build' before starting the production server."
    )


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path.startswith("api/"):
        abort(404)
    if path and os.path.exists(os.path.join(DIST_DIR, path)):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")

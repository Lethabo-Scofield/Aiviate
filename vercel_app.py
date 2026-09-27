"""Single Flask entrypoint for deploying the workspace to Vercel."""
import os
import sys
from pathlib import Path

from flask import abort, send_from_directory

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "artifacts" / "api-server" / "backend"
PUBLIC = ROOT / "artifacts" / "aiviate-dispatch" / "dist" / "public"

# The imported API performs its schema setup outside the serverless runtime.
os.environ.setdefault("SKIP_DB_INIT", "true")
sys.path.insert(0, str(BACKEND))

from app import create_app  # noqa: E402

app = create_app()


@app.route("/<path:path>")
def serve_website(path):
    if path == "api" or path.startswith("api/"):
        abort(404)
    if path:
        requested = (PUBLIC / path).resolve()
        if requested.is_relative_to(PUBLIC.resolve()) and requested.is_file():
            return send_from_directory(PUBLIC, path)
    return send_from_directory(PUBLIC, "index.html")


# The imported Flask app uses "/" as a JSON status endpoint. On Vercel this
# entrypoint serves the website at "/" while keeping every /api route intact.
app.view_functions["root"] = lambda: serve_website("")
"""Development-only, fixed-destination relay for the imported driver app's web preview.

The original live API does not allow cross-origin browser requests from the
Expo Preview. Native clients contact it directly; this relay exists only in
the Replit workspace and only exposes the driver app's known API operations.
"""

import re
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from flask import Blueprint, Response, jsonify, request


driver_live_bp = Blueprint("driver_live", __name__)
LIVE_API = "https://aiviate.olyxee.com/api"
SEGMENT = r"[A-Za-z0-9_-]{1,100}"
ALLOWED = (
    (re.compile(r"auth/(?:login|activate|forgot-password|reset-password)"), {"POST"}),
    (re.compile(r"auth/me"), {"GET"}),
    (re.compile(r"my-jobs"), {"GET"}),
    (re.compile(rf"my-jobs/{SEGMENT}/complete/{SEGMENT}"), {"POST"}),
    (re.compile(rf"drivers/{SEGMENT}/location"), {"POST"}),
    (re.compile(r"alerts"), {"GET"}),
)


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


@driver_live_bp.route("/api/live-driver/<path:operation>", methods=["GET", "POST"])
def relay_driver_request(operation):
    # Never turn the published API into an unauthenticated relay.
    from os import environ

    if not environ.get("REPLIT_DEV_DOMAIN"):
        return jsonify({"error": "Driver Preview relay is unavailable"}), 404

    if not any(pattern.fullmatch(operation) and request.method in methods
               for pattern, methods in ALLOWED):
        return jsonify({"error": "Driver operation not available"}), 404

    if request.content_length is not None and request.content_length > 1_000_000:
        return jsonify({"error": "Request too large"}), 413

    body = request.get_data(cache=False)
    if len(body) > 1_000_000:
        return jsonify({"error": "Request too large"}), 413

    headers = {"Accept": "application/json"}
    if request.headers.get("Authorization"):
        headers["Authorization"] = request.headers["Authorization"]
    if body:
        headers["Content-Type"] = "application/json"

    url = f"{LIVE_API}/{operation}"
    if request.query_string:
        url += "?" + request.query_string.decode("ascii")

    upstream_request = Request(
        url, data=body if request.method == "POST" else None,
        headers=headers, method=request.method,
    )
    try:
        with build_opener(NoRedirects()).open(upstream_request, timeout=20) as upstream:
            status = upstream.status
            response_body = upstream.read(2_000_000)
            content_type = upstream.headers.get("Content-Type", "application/json")
    except HTTPError as error:
        status = error.code
        response_body = error.read(2_000_000)
        content_type = error.headers.get("Content-Type", "application/json")
    except (URLError, TimeoutError):
        return jsonify({"error": "Could not reach the live driver service. Try again shortly."}), 502

    # Do not forward cookies, redirects, or other upstream response headers.
    if status in (301, 302, 303, 307, 308):
        return jsonify({"error": "Live driver service redirected unexpectedly"}), 502
    return Response(
        response_body, status=status,
        headers={"Content-Type": content_type, "Cache-Control": "no-store"},
    )
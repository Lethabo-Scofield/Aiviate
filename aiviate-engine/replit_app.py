"""Replit entrypoint for the Aiviate decision engine.

Sets credential-free, deterministic defaults, seeds a local organisation and
API key, then exposes the FastAPI app for uvicorn:

    uvicorn replit_app:app --host 0.0.0.0 --port 8080
"""

from __future__ import annotations

import os
from pathlib import Path

_HERE = Path(__file__).resolve().parent

os.environ.setdefault("AIVIATE_DATABASE_URL", f"sqlite:///{_HERE / 'aiviate.db'}")
os.environ.setdefault("AIVIATE_JOBS_EAGER", "true")
os.environ.setdefault("AIVIATE_GEOCODING_PROVIDER", "local")
os.environ.setdefault("AIVIATE_MATRIX_PROVIDER", "haversine")
os.environ.setdefault("AIVIATE_LOG_JSON", "false")

from aiviate.replit_seed import ensure_seed  # noqa: E402

ensure_seed()

from aiviate.api.app import create_app  # noqa: E402

app = create_app()

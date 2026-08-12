import os
import sys

ROOT = os.path.dirname(os.path.dirname(__file__))
BACKEND = os.path.join(ROOT, "Website", "backend")

if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

os.environ.setdefault("SKIP_DB_INIT", "true")

from app import create_app  # noqa: E402

app = create_app()

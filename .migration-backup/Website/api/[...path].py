import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from vercel_entrypoint import app  # noqa: E402

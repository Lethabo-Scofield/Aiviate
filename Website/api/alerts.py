import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from _bootstrap import build_app  # noqa: E402

app = build_app()

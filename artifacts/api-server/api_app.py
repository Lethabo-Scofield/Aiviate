"""Serve the imported Flask API through the Replit API artifact."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app import create_app

app = create_app()
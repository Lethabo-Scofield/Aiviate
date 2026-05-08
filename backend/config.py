import os
import tempfile
from pathlib import Path

# Load .env from the project root (two levels up from this file: backend/ -> root)
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path, override=False)
    except ImportError:
        # dotenv not installed — parse manually as fallback
        with open(_env_path) as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _, _v = _line.partition("=")
                    os.environ.setdefault(_k.strip(), _v.strip())

NEON_DATABASE_URL = os.environ.get("NEON_DATABASE_URL")
if not NEON_DATABASE_URL:
    raise RuntimeError("NEON_DATABASE_URL environment variable is not set")

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    JWT_SECRET = os.urandom(32).hex()
    print("WARNING: JWT_SECRET not set, using random secret. Tokens will not persist across restarts.")

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")

UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), "aiviate_uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

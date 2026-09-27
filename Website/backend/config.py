import os
import tempfile

NEON_DATABASE_URL = os.environ.get("NEON_DATABASE_URL") or os.environ.get("DATABASE_URL")
if not NEON_DATABASE_URL:
    fallback_db = os.path.join(tempfile.gettempdir(), "aiviate_fallback.db")
    NEON_DATABASE_URL = f"sqlite:///{fallback_db}"
    print(
        "WARNING: NEON_DATABASE_URL/DATABASE_URL not set. "
        f"Falling back to {NEON_DATABASE_URL}."
    )

JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get("SESSION_SECRET")
if not JWT_SECRET:
    JWT_SECRET = os.urandom(32).hex()
    print("WARNING: JWT_SECRET not set, using random secret. Tokens will not persist across restarts.")

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")

UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), "aiviate_uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

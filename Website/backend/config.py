import os
import tempfile

from db_url import resolve_database_url


try:
    NEON_DATABASE_URL = resolve_database_url()
except RuntimeError:
    fallback_db = os.path.join(tempfile.gettempdir(), "aiviate_fallback.db")
    NEON_DATABASE_URL = f"sqlite:///{fallback_db}"
    print(
        "WARNING: No configured database URL found. "
        f"Falling back to {NEON_DATABASE_URL}."
    )

JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get("SESSION_SECRET")
if not JWT_SECRET:
    JWT_SECRET = os.urandom(32).hex()
    print("WARNING: JWT_SECRET not set, using random secret. Tokens will not persist across restarts.")

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")

UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), "aiviate_uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

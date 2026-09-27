import os
import tempfile

from db_url import resolve_database_url

NEON_DATABASE_URL = resolve_database_url()

JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get("SESSION_SECRET")
if not JWT_SECRET:
    JWT_SECRET = os.urandom(32).hex()
    print("WARNING: JWT_SECRET not set, using random secret. Tokens will not persist across restarts.")

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")

UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), "aiviate_uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

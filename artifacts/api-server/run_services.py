"""Run the imported Flask API and its co-located route-planning engine."""
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE = HERE / "aiviate-engine"
PORT = os.environ.get("PORT", "8080")
ENGINE_PORT = "8099"

engine_env = os.environ.copy()
engine_env["PYTHONPATH"] = str(ENGINE / "src")
api_env = os.environ.copy()
api_env.setdefault("ENGINE_URL", f"http://127.0.0.1:{ENGINE_PORT}")

engine = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "replit_app:app", "--host", "127.0.0.1", "--port", ENGINE_PORT],
    cwd=ENGINE,
    env=engine_env,
)
api_command = [
    sys.executable, "-m", "gunicorn", "--bind", f"0.0.0.0:{PORT}",
    "--chdir", str(HERE), "api_app:app",
]
if "--reload" in sys.argv:
    api_command.append("--reload")
api = subprocess.Popen(api_command, env=api_env)

def shutdown(_signal=None, _frame=None):
    for process in (api, engine):
        if process.poll() is None:
            process.terminate()
    for process in (api, engine):
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()

signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)
try:
    while api.poll() is None and engine.poll() is None:
        time.sleep(0.5)
finally:
    shutdown()
if api.returncode:
    sys.exit(api.returncode)
if engine.returncode:
    sys.exit(engine.returncode)
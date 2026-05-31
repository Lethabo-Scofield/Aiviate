import os

from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy import text, inspect

from config import ALLOWED_ORIGINS
from models import init_db, engine
from routes import (
    auth_bp, jobs_bp, drivers_bp, stops_bp, optimization_bp, stats_bp,
    safety_bp, devices_bp, alerts_bp, liveops_bp, intelligence_bp, agents_bp,
    autopilot_bp,
)


def create_app():
    app = Flask(__name__)

    cors_origins = "*" if ALLOWED_ORIGINS == "*" else [o.strip() for o in ALLOWED_ORIGINS.split(",")]
    CORS(app,
         origins=cors_origins,
         allow_headers=["Content-Type", "Authorization"],
         methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])

    skip_db_init = (
        os.environ.get("SKIP_DB_INIT", "false").lower() == "true"
        or os.environ.get("VERCEL", "0") == "1"
    )
    if skip_db_init:
        print("DB init/migrations skipped for serverless runtime")
    else:
        try:
            init_db()
            _run_migrations()
        except Exception as e:
            print(f"WARNING: DB init/migrations skipped at cold start: {type(e).__name__}: {e}")

    app.register_blueprint(auth_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(drivers_bp)
    app.register_blueprint(stops_bp)
    app.register_blueprint(optimization_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(safety_bp)
    app.register_blueprint(devices_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(liveops_bp)
    app.register_blueprint(intelligence_bp)
    app.register_blueprint(agents_bp)
    app.register_blueprint(autopilot_bp)

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "Aiviate Dispatch API"})

    return app


def _run_migrations():
    with engine.connect() as conn:
        inspector = inspect(engine)
        table_names = inspector.get_table_names()

        def add_col_if_missing(table, col_name, col_def):
            if table in table_names:
                cols = [c["name"] for c in inspector.get_columns(table)]
                if col_name not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
                    conn.commit()
                    print(f"  Added {col_name} to {table}")

        add_col_if_missing("jobs", "route_geometry", "TEXT")
        add_col_if_missing("jobs", "company_id", "VARCHAR REFERENCES companies(id)")
        add_col_if_missing("stops", "company_id", "VARCHAR REFERENCES companies(id)")
        add_col_if_missing("drivers", "company_id", "VARCHAR REFERENCES companies(id)")
        add_col_if_missing("drivers", "user_id", "VARCHAR")
        add_col_if_missing("drivers", "blocked", "BOOLEAN DEFAULT FALSE")
        add_col_if_missing("drivers", "last_generated_password", "VARCHAR")
        add_col_if_missing("drivers", "current_lat", "DOUBLE PRECISION")
        add_col_if_missing("drivers", "current_lng", "DOUBLE PRECISION")
        add_col_if_missing("drivers", "location_updated_at", "TIMESTAMP")
        add_col_if_missing("users", "driver_id", "VARCHAR")


if __name__ == "__main__":
    app = create_app()
    print("Aiviate Dispatch API starting on port 8000")
    app.run(
        debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true",
        host="0.0.0.0",
        port=8000,
    )

"""Application settings.

Deployment-level configuration only. Business behaviour (objective weights,
thresholds, service areas, safety policies) is configured per organisation via
``aiviate.rules`` and must not live here.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AIVIATE_", env_file=".env", extra="ignore")

    environment: str = "local"

    # Persistence. SQLite by default for local development and tests;
    # point at PostgreSQL (postgresql+psycopg://...) in production.
    database_url: str = "sqlite:///./aiviate.db"
    database_echo: bool = False

    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Providers. "local" adapters are deterministic and credential-free.
    geocoding_provider: str = "local"  # local | nominatim
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    matrix_provider: str = "haversine"  # osrm | haversine
    osrm_base_url: str = "http://localhost:5000"
    matrix_coordinate_precision: int = 5  # decimal places used in cache keys
    provider_timeout_seconds: float = 10.0
    provider_max_retries: int = 3

    # Background jobs. Eager mode executes jobs synchronously (deterministic,
    # used by tests and the simulation); worker mode uses a thread worker.
    jobs_eager: bool = False

    solver_time_limit_seconds: int = 10

    rate_limit_per_minute: int = 240
    log_json: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()

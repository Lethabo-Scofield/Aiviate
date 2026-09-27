import os


DATABASE_ENV_KEYS = (
    "NEON_DATABASE_URL",
    "DATABASE_URL",
    "POSTGRES_URL",
    # This deployment already stores the shared Neon/Postgres URL here for
    # the BulkMart/Aiviate order bridge, so use it as a backwards-compatible
    # operational DB fallback when the canonical keys are missing.
    "ORDERS_DATABASE_KEY",
)


def resolve_database_url():
    for key in DATABASE_ENV_KEYS:
        value = os.environ.get(key)
        if value:
            return value
    raise RuntimeError(
        "Database connection string is not set. Configure one of: "
        + ", ".join(DATABASE_ENV_KEYS)
    )

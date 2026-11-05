"""Where is this process running? Small helpers shared by the integrations."""
import os


def is_production():
    """True when the process looks like a real deployment.

    Covers the hosts this project deploys to (Vercel, Azure App Service, Replit
    deployments) plus an explicit APP_ENV=production for anywhere else.
    """
    return (
        os.environ.get("APP_ENV", "").lower() == "production"
        or os.environ.get("VERCEL_ENV", "").lower() == "production"
        or bool(os.environ.get("WEBSITE_SITE_NAME"))
        or os.environ.get("REPLIT_DEPLOYMENT", "") == "1"
    )


def dev_override(name, default):
    """An environment override that is honoured only outside production.

    It exists so tests and local demos can point an integration at a local fake
    (Gmail, an LLM). In production it is ignored, so credentials and email
    content can never be redirected to another host by an environment variable.
    """
    value = os.environ.get(name, "").strip().rstrip("/")
    if value and not is_production():
        return value
    return default

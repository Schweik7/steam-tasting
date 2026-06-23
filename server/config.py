"""Configuration, loaded from environment / .env via python-dotenv."""
import os

from dotenv import load_dotenv

load_dotenv()  # reads .env in CWD if present; real env vars take precedence

# Steam Web API key (the ONE key the developer registers; users never need one).
STEAM_API_KEY: str = os.getenv("STEAM_API_KEY", "")

# Long random string used to sign session cookies.
SESSION_SECRET: str = os.getenv("SESSION_SECRET", "")

# Port the backend listens on.
PORT: int = int(os.getenv("PORT", "8787"))

# Externally reachable base URL of THIS backend (used to build the OpenID
# realm + return_to). Dev with the Vite proxy: http://localhost:5173.
PUBLIC_URL: str = os.getenv("PUBLIC_URL", "http://localhost:5173")

# Where to send the user after a successful login.
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "/")

# Optional outbound proxy for reaching Steam (e.g. http://127.0.0.1:7890).
# Needed in networks where api.steampowered.com / steamcommunity.com are
# blocked. Left empty in normal server deployments.
PROXY_URL: str | None = os.getenv("PROXY_URL") or None

# Developer-provided LLM, used when a user enters a valid MagicVal (so they
# don't have to bring their own API). Leave empty to disable the magic path.
LLM_API_BASE: str = os.getenv("LLM_API_BASE", "")
LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
LLM_MODEL: str = os.getenv("LLM_MODEL", "")


# MagicVal gate: entering this exact string unlocks the developer's LLM.
# Accept both the en-dash and plain-hyphen spellings.
MAGIC_VALUES = {"2016–2026", "2016-2026"}


def magic_ok(value: str) -> bool:
    return (value or "").strip() in MAGIC_VALUES

# True when serving over HTTPS -> session cookie gets the Secure flag.
COOKIE_SECURE: bool = PUBLIC_URL.startswith("https://")


def validate() -> None:
    """Fail fast on missing required config."""
    if not STEAM_API_KEY:
        raise SystemExit(
            "FATAL: STEAM_API_KEY is not set. Copy .env.example to .env and fill it in."
        )
    if not SESSION_SECRET or len(SESSION_SECRET) < 16:
        raise SystemExit(
            "FATAL: SESSION_SECRET must be a long random string (>= 16 chars)."
        )

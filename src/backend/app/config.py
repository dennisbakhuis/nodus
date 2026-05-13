"""Centralized configuration for the Nodus backend.

Every ``NODUS_*`` environment variable that the backend reads is funnelled
through this module. Functions re-read ``os.environ`` on each call, so
pytest ``monkeypatch.setenv`` continues to work as it did before the
refactor.

The runtime auth-mode selection logic lives here as :func:`active_auth_mode`,
which produces the label logged at lifespan startup.
"""

from __future__ import annotations

import os
from collections.abc import Iterable

_TRUTHY: frozenset[str] = frozenset({"1", "true", "yes", "on"})

# --- env var names (single source of truth) -------------------------------

ENV_VAR = "NODUS_ENV"
AUTH_DISABLED_VAR = "NODUS_AUTH_DISABLED"
PUBLIC_READER_DISABLED_VAR = "NODUS_PUBLIC_READER_DISABLED"
RESET_DB_VAR = "NODUS_RESET_DB"
DATABASE_URL_VAR = "NODUS_DATABASE_URL"
CORS_ORIGINS_VAR = "NODUS_CORS_ORIGINS"

DOCS_DISABLED_VAR = "NODUS_DOCS_DISABLED"
DOCS_USERNAME_VAR = "NODUS_DOCS_USERNAME"
DOCS_PASSWORD_VAR = "NODUS_DOCS_PASSWORD"
ROOT_PATH_VAR = "NODUS_ROOT_PATH"
SWAGGER_JS_URL_VAR = "NODUS_SWAGGER_JS_URL"
SWAGGER_CSS_URL_VAR = "NODUS_SWAGGER_CSS_URL"
REDOC_JS_URL_VAR = "NODUS_REDOC_JS_URL"

AUTH_ENTRA_ENABLED_VAR = "NODUS_AUTH_ENTRA_ENABLED"
AUTH_ENTRA_TENANT_ID_VAR = "NODUS_AUTH_ENTRA_TENANT_ID"
AUTH_ENTRA_CLIENT_ID_VAR = "NODUS_AUTH_ENTRA_CLIENT_ID"
AUTH_ENTRA_CLIENT_SECRET_VAR = "NODUS_AUTH_ENTRA_CLIENT_SECRET"
AUTH_ENTRA_REDIRECT_URI_VAR = "NODUS_AUTH_ENTRA_REDIRECT_URI"

# --- defaults exposed for documentation/tests -----------------------------

DEFAULT_CORS_ORIGINS: tuple[str, ...] = ("http://localhost:5173",)
DEFAULT_DOCS_USERNAME = "admin"
DEFAULT_SWAGGER_JS_URL = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"
DEFAULT_SWAGGER_CSS_URL = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"
DEFAULT_REDOC_JS_URL = "https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"

# --- generic helpers ------------------------------------------------------


def _env_truthy(name: str) -> bool:
    """Return True if ``os.environ[name]`` is one of {1, true, yes, on}."""
    return os.getenv(name, "").strip().lower() in _TRUTHY


def _env_str(name: str, default: str = "") -> str:
    """Return the trimmed env value, or ``default`` if unset/empty."""
    raw = os.getenv(name, "")
    return raw if raw else default


# --- auth ----------------------------------------------------------------


def auth_disabled() -> bool:
    """Whether the auth system has been turned off via NODUS_AUTH_DISABLED.

    When True, every request is treated as a synthetic admin — see
    ``app.auth.synthetic_admin``.
    """
    return _env_truthy(AUTH_DISABLED_VAR)


def public_reader_disabled() -> bool:
    """Whether the public-reader fallback has been turned off.

    When True, anonymous requests and accounts with role ``public_reader``
    are rejected with 401 on every endpoint that previously allowed them.
    The deployment then requires a login (Reader/Writer/Admin) to see
    anything at all.

    Has no effect when ``NODUS_AUTH_DISABLED`` is set — that flag
    short-circuits to the synthetic admin before this check runs.
    """
    return _env_truthy(PUBLIC_READER_DISABLED_VAR)


def auth_entra_enabled() -> bool:
    """Whether Entra (Azure AD) SSO is enabled via NODUS_AUTH_ENTRA_ENABLED."""
    return _env_truthy(AUTH_ENTRA_ENABLED_VAR)


def env_allows_demo_seeding() -> bool:
    """True if NODUS_ENV is ``dev`` or ``test`` — required to seed demo users."""
    return os.getenv(ENV_VAR, "").strip().lower() in {"dev", "test"}


def env_label() -> str:
    """Return the trimmed lowercase value of NODUS_ENV, or '' if unset."""
    return os.getenv(ENV_VAR, "").strip().lower()


# --- database ------------------------------------------------------------


def reset_db_allowed() -> bool:
    """True when NODUS_RESET_DB is set; required for destructive DB rebuild."""
    return _env_truthy(RESET_DB_VAR)


def database_url() -> str:
    """Return ``NODUS_DATABASE_URL`` if set, else ''.

    An empty return means "use the built-in SQLite default" — ``app.db``
    resolves the default to an absolute path under the backend root, so the
    file lives in one place regardless of cwd. Any non-empty value is passed
    straight to SQLAlchemy, allowing operators to swap in Postgres
    (``postgresql+psycopg://user:pass@host/db``) or another supported
    dialect without code changes.
    """
    return _env_str(DATABASE_URL_VAR, "")


# --- CORS ----------------------------------------------------------------


def cors_origins() -> list[str]:
    """Parse NODUS_CORS_ORIGINS as a comma-separated allow-list of origins.

    Falls back to ``http://localhost:5173`` (vite dev) when unset or empty.
    """
    raw = os.getenv(CORS_ORIGINS_VAR, "").strip()
    if not raw:
        return list(DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


# --- OpenAPI docs --------------------------------------------------------


def docs_disabled() -> bool:
    """Whether /docs, /redoc, /openapi.json should 404."""
    return _env_truthy(DOCS_DISABLED_VAR)


def docs_username() -> str:
    """HTTP Basic username for /docs; defaults to 'admin'."""
    return _env_str(DOCS_USERNAME_VAR, DEFAULT_DOCS_USERNAME)


def docs_password() -> str:
    """HTTP Basic password for /docs; empty means no auth required."""
    return _env_str(DOCS_PASSWORD_VAR, "")


def root_path() -> str:
    """ASGI root_path for reverse-proxy mounts; empty means no prefix."""
    return _env_str(ROOT_PATH_VAR, "")


def swagger_js_url() -> str:
    """Swagger UI bundle URL (self-hostable via env)."""
    return _env_str(SWAGGER_JS_URL_VAR, DEFAULT_SWAGGER_JS_URL)


def swagger_css_url() -> str:
    """Swagger UI CSS URL (self-hostable via env)."""
    return _env_str(SWAGGER_CSS_URL_VAR, DEFAULT_SWAGGER_CSS_URL)


def redoc_js_url() -> str:
    """ReDoc bundle URL (self-hostable via env)."""
    return _env_str(REDOC_JS_URL_VAR, DEFAULT_REDOC_JS_URL)


# --- Entra ID ------------------------------------------------------------


def entra_tenant_id() -> str:
    return _env_str(AUTH_ENTRA_TENANT_ID_VAR, "")


def entra_client_id() -> str:
    return _env_str(AUTH_ENTRA_CLIENT_ID_VAR, "")


def entra_client_secret() -> str:
    return _env_str(AUTH_ENTRA_CLIENT_SECRET_VAR, "")


def entra_redirect_uri() -> str:
    return _env_str(AUTH_ENTRA_REDIRECT_URI_VAR, "")


def entra_group_for_role(role: str) -> str:
    """Return the configured Entra group object ID for an application role.

    ``role`` is the lowercase enum value (``admin``/``writer``/``reader``/
    ``public_reader``). Unknown roles return an empty string.
    """
    suffix_by_role = {
        "admin": "ADMIN",
        "writer": "WRITER",
        "reader": "READER",
        "public_reader": "PUBLIC_READER",
    }
    suffix = suffix_by_role.get(role.lower())
    if suffix is None:
        return ""
    return _env_str(f"NODUS_AUTH_ENTRA_GROUP_{suffix}", "")


# --- aggregate summary ---------------------------------------------------


def active_auth_mode() -> str:
    """One-line label describing the active auth mode, for boot logging.

    Resolution order matches the runtime provider chain:
    ``NODUS_AUTH_DISABLED`` short-circuits → ``auth-disabled``. Otherwise the
    presence of ``NODUS_AUTH_ENTRA_ENABLED`` determines whether Entra is
    layered onto the local provider.
    """
    if auth_disabled():
        return "auth-disabled (synthetic admin)"
    if auth_entra_enabled():
        return "local + entra"
    return "local-only"


def iter_active_flags() -> Iterable[tuple[str, str]]:
    """Yield (name, value) pairs for every NODUS_* var currently set.

    Used in startup logging; never includes secret values verbatim.
    """
    sensitive = {AUTH_ENTRA_CLIENT_SECRET_VAR, DOCS_PASSWORD_VAR, DATABASE_URL_VAR}
    for name in (
        AUTH_DISABLED_VAR,
        PUBLIC_READER_DISABLED_VAR,
        ENV_VAR,
        RESET_DB_VAR,
        DATABASE_URL_VAR,
        CORS_ORIGINS_VAR,
        DOCS_DISABLED_VAR,
        DOCS_USERNAME_VAR,
        DOCS_PASSWORD_VAR,
        ROOT_PATH_VAR,
        SWAGGER_JS_URL_VAR,
        SWAGGER_CSS_URL_VAR,
        REDOC_JS_URL_VAR,
        AUTH_ENTRA_ENABLED_VAR,
        AUTH_ENTRA_TENANT_ID_VAR,
        AUTH_ENTRA_CLIENT_ID_VAR,
        AUTH_ENTRA_CLIENT_SECRET_VAR,
        AUTH_ENTRA_REDIRECT_URI_VAR,
    ):
        raw = os.getenv(name)
        if raw is None or raw == "":
            continue
        if name in sensitive:
            yield name, "***"
        else:
            yield name, raw

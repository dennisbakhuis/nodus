import logging
import secrets
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _pkg_version
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.types import Scope

from app import config
from app.auth import current_user_optional, hash_password
from app.db import create_db_and_tables, engine
from app.models import Setting
from app.models.user import User, UserRole
from app.routers import (
    api_keys_router,
    auth_entra_router,
    auth_router,
    backup_router,
    cycles_router,
    initiatives_router,
    media_router,
    movements_router,
    parties_router,
    peer_import_router,
    peer_references_router,
    persons_router,
    radar_router,
    registry_router,
    relations_router,
    segments_router,
    settings_router,
    topic_persons_router,
    users_router,
)
from app.schemas import HealthResponse

_log = logging.getLogger("app.main")

NODUS_ENV_VAR = config.ENV_VAR


def _resolve_version() -> str:
    """Return the running app version.

    Resolution order:
    1. Installed package metadata (Hatch's dynamic-version source reads
       the canonical ``VERSION`` file at build time and stamps the wheel).
    2. ``app/VERSION`` bundled inside the wheel — covers containers that
       run the package without installing it.
    3. Repo-root ``VERSION`` — covers running directly from a clone.
    4. ``"0.0.0+unknown"`` last-resort sentinel.
    """
    try:
        return _pkg_version("nodus-backend")
    except PackageNotFoundError:
        pass
    here = Path(__file__).resolve()
    candidates: list[Path] = [here.parent / "VERSION"]
    # `parents[3]` is the repo root when running from a clone
    # (src/backend/app/main.py → repo root). In the slim Docker image
    # main.py sits at /app/app/main.py so parents[3] doesn't exist; only
    # add it when it's actually reachable.
    parents = here.parents
    if len(parents) > 3:
        candidates.append(parents[3] / "VERSION")
    for candidate in candidates:
        if candidate.exists():
            return candidate.read_text().strip()
    return "0.0.0+unknown"


APP_VERSION = _resolve_version()


def _env_allows_demo_seeding() -> bool:
    """Whether the current NODUS_ENV permits creating demo users.

    Thin wrapper around :func:`app.config.env_allows_demo_seeding` kept here
    for backwards compatibility with existing tests that monkeypatch and
    re-import this symbol.
    """
    return config.env_allows_demo_seeding()


DEFAULT_SETTINGS = {
    "radar.title": "Technology Radar",
    "radar.center_logo_url": "nodus",
}


def seed_settings(session: Session) -> None:
    """Insert default settings rows if they are not already present."""
    for key, value in DEFAULT_SETTINGS.items():
        existing = session.exec(select(Setting).where(Setting.key == key)).first()
        if existing is None:
            session.add(Setting(key=key, value=value))
    session.commit()


DEMO_USERS = [
    {
        "username": "demo_public",
        "first_name": "Demo",
        "last_name": "Public",
        "role": UserRole.PublicReader.value,
    },
    {
        "username": "demo_reader",
        "first_name": "Demo",
        "last_name": "Reader",
        "role": UserRole.Reader.value,
    },
    {
        "username": "demo_writer",
        "first_name": "Demo",
        "last_name": "Writer",
        "role": UserRole.Writer.value,
    },
    {
        "username": "demo_admin",
        "first_name": "Demo",
        "last_name": "Admin",
        "role": UserRole.Admin.value,
    },
]
DEMO_PASSWORD = "demo"


def seed_demo_users(session: Session) -> None:
    """Insert one demo account per role with password "demo" if missing.

    Refuses to run unless `NODUS_ENV` is `dev` or `test`. Demo accounts
    use a well-known password (`DEMO_PASSWORD`) and must not be created
    in production. Logs a one-line INFO when skipped so operators can
    see the gate firing.
    """
    if not _env_allows_demo_seeding():
        _log.info(
            "Skipping demo-user seeding: %s=%r is not 'dev' or 'test'.",
            config.ENV_VAR,
            config.env_label(),
        )
        return
    for spec in DEMO_USERS:
        existing = session.exec(select(User).where(User.username == spec["username"])).first()
        if existing is None:
            session.add(
                User(
                    username=spec["username"],
                    first_name=spec["first_name"],
                    last_name=spec["last_name"],
                    role=spec["role"],
                    password_hash=hash_password(DEMO_PASSWORD),
                )
            )
    session.commit()


@asynccontextmanager
async def lifespan(fastapi_app: FastAPI) -> AsyncGenerator[None]:
    """Bootstrap on startup.

    Creates tables, writes default settings rows, and seeds demo users in dev.
    Segments are intentionally left empty — operators add them via the
    management UI or by running ``make seed-dummy``.
    """
    import app.models as _models  # noqa: F401 — ensure all SQLModel tables are registered

    del _models
    create_db_and_tables()
    with Session(engine) as session:
        seed_settings(session)
        seed_demo_users(session)
    yield


# ---------------------------------------------------------------------------
# API docs & startup configuration
# ---------------------------------------------------------------------------
# All NODUS_* env vars flow through app.config — see src/backend/.env.example
# and docs/auth.md for the operator-facing documentation.

_DOCS_DISABLED = config.docs_disabled()
_DOCS_USERNAME = config.docs_username()
_DOCS_PASSWORD = config.docs_password()
_ROOT_PATH = config.root_path()
_SWAGGER_JS_URL = config.swagger_js_url()
_SWAGGER_CSS_URL = config.swagger_css_url()
_REDOC_JS_URL = config.redoc_js_url()


_log.info("Nodus boot: version=%s, auth mode=%s", APP_VERSION, config.active_auth_mode())
if config.auth_disabled():
    _log.warning(
        "NODUS_AUTH_DISABLED is set — every request runs as the synthetic local "
        "admin. Do not use this mode in production."
    )


application = FastAPI(
    title="Nodus API",
    version=APP_VERSION,
    lifespan=lifespan,
    # We own the docs / openapi.json routes below so we can add auth and
    # respect NODUS_DOCS_DISABLED. Disable the FastAPI defaults here.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    root_path=_ROOT_PATH,
)


_basic_auth = HTTPBasic(auto_error=False)


def _require_docs_auth(
    credentials: Annotated[HTTPBasicCredentials | None, Depends(_basic_auth)],
) -> None:
    """No-op when no password is configured; otherwise enforce HTTP Basic."""
    if not _DOCS_PASSWORD:
        return
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Basic"},
        )
    user_ok = secrets.compare_digest(credentials.username, _DOCS_USERNAME)
    pass_ok = secrets.compare_digest(credentials.password, _DOCS_PASSWORD)
    if not (user_ok and pass_ok):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )


if not _DOCS_DISABLED:

    @application.get("/openapi.json", include_in_schema=False)
    def _openapi_json(
        _: Annotated[None, Depends(_require_docs_auth)],
    ) -> JSONResponse:
        """Authenticated OpenAPI schema endpoint."""
        return JSONResponse(
            get_openapi(
                title=application.title,
                version=application.version,
                routes=application.routes,
            )
        )

    @application.get("/docs", include_in_schema=False)
    def _swagger_ui(
        _: Annotated[None, Depends(_require_docs_auth)],
    ) -> HTMLResponse:
        """Swagger UI — self-hostable JS/CSS via env vars."""
        return get_swagger_ui_html(
            openapi_url=f"{_ROOT_PATH}/openapi.json",
            title=f"{application.title} — Swagger UI",
            swagger_js_url=_SWAGGER_JS_URL,
            swagger_css_url=_SWAGGER_CSS_URL,
        )

    @application.get("/redoc", include_in_schema=False)
    def _redoc(
        _: Annotated[None, Depends(_require_docs_auth)],
    ) -> HTMLResponse:
        """ReDoc — self-hostable JS via env var."""
        return get_redoc_html(
            openapi_url=f"{_ROOT_PATH}/openapi.json",
            title=f"{application.title} — ReDoc",
            redoc_js_url=_REDOC_JS_URL,
        )


application.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

application.include_router(auth_router, prefix="/api")
application.include_router(auth_entra_router, prefix="/api")

# Every non-auth router gets ``current_user_optional`` as a router-level
# dependency. Its return value is discarded here; it's wired in solely so
# the NODUS_PUBLIC_READER_DISABLED chokepoint fires on routes that don't
# already declare ``OptionalUserDep`` (e.g. ``GET /api/cycles``). When the
# flag is unset, the dependency is a no-op aside from the bearer lookup.
_gated = [Depends(current_user_optional)]

application.include_router(registry_router, prefix="/api", dependencies=_gated)
application.include_router(cycles_router, prefix="/api", dependencies=_gated)
application.include_router(initiatives_router, prefix="/api", dependencies=_gated)
application.include_router(movements_router, prefix="/api", dependencies=_gated)
application.include_router(relations_router, prefix="/api", dependencies=_gated)
application.include_router(radar_router, prefix="/api", dependencies=_gated)
application.include_router(media_router, prefix="/api", dependencies=_gated)
application.include_router(persons_router, prefix="/api", dependencies=_gated)
application.include_router(topic_persons_router, prefix="/api", dependencies=_gated)
application.include_router(parties_router, prefix="/api", dependencies=_gated)
application.include_router(peer_references_router, prefix="/api", dependencies=_gated)
application.include_router(peer_import_router, prefix="/api", dependencies=_gated)
application.include_router(segments_router, prefix="/api", dependencies=_gated)
application.include_router(settings_router, prefix="/api", dependencies=_gated)
application.include_router(users_router, prefix="/api", dependencies=_gated)
application.include_router(api_keys_router, prefix="/api", dependencies=_gated)
application.include_router(backup_router, prefix="/api", dependencies=_gated)


@application.get("/api/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Return service liveness status and version."""
    return HealthResponse(status="ok", version=APP_VERSION)


class SpaStaticFiles(StaticFiles):
    """StaticFiles that falls back to index.html for unknown paths.

    React Router pushes client-side routes like /radar and /topic/<slug>;
    on a reload (or any direct hit) the browser asks the backend for that
    path. Plain StaticFiles returns 404 because no such file exists on
    disk; this subclass returns index.html instead so the SPA router can
    resolve the route client-side. API routes are unaffected — they're
    registered before this catch-all mount and take precedence.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            # Starlette's StaticFiles raises starlette.exceptions.HTTPException,
            # the parent of fastapi.HTTPException — so we have to catch the
            # base class for the fallback to fire.
            if exc.status_code == 404 and not path.startswith("api/"):
                return await super().get_response("index.html", scope)
            raise


# Serve the built Vite frontend from the same process when the bundled
# `static/` directory exists alongside the backend (the layout produced by
# the root Dockerfile). In dev — where the directory is absent and the
# frontend runs on Vite — the mount is silently skipped.
_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if _STATIC_DIR.is_dir():
    application.mount("/", SpaStaticFiles(directory=_STATIC_DIR, html=True), name="frontend")


app = application

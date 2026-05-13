import logging
import os
import sqlite3
from collections.abc import Generator
from pathlib import Path
from typing import Annotated
from urllib.parse import urlparse

from fastapi import Depends
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine, text

from app import config

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_SQLITE_FILE = _BACKEND_ROOT / "radar.db"
_DEFAULT_DATABASE_URL = f"sqlite:///{_DEFAULT_SQLITE_FILE}"


def _resolve_database_url() -> str:
    """Pick the runtime URL: ``NODUS_DATABASE_URL`` if set, else the SQLite default.

    The SQLite default is an *absolute* path under the backend source root
    so the database lives in one place regardless of which directory the
    process was launched from.
    """
    return config.database_url() or _DEFAULT_DATABASE_URL


def _sqlite_file_path(url: str) -> str | None:
    """Return the on-disk path for a SQLite URL, or ``None`` for anything else.

    Returns ``None`` for non-SQLite URLs and for ``:memory:`` databases —
    both cases have no file the operator can delete or back up.
    """
    if not url.startswith("sqlite"):
        return None
    parsed = urlparse(url)
    path = parsed.path or ""
    if path.startswith("/"):
        path = path[1:]
    if not path or path == ":memory:":
        return None
    return path


DATABASE_URL = _resolve_database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")
DB_FILE: str | None = _sqlite_file_path(DATABASE_URL)

_engine_connect_args: dict[str, object] = {"check_same_thread": False} if IS_SQLITE else {}

engine = create_engine(DATABASE_URL, connect_args=_engine_connect_args)


_FK_ENFORCEMENT_ENABLED = True


def set_sqlite_fk_enforcement(enabled: bool) -> None:
    """Process-wide override for the SQLite FK pragma.

    Provided for table-rebuild scenarios that need FK enforcement temporarily
    relaxed — SQLite cannot drop a table referenced by inbound FKs while
    enforcement is on. Reset to ``True`` immediately after the operation so
    application code never runs without enforcement.
    """
    global _FK_ENFORCEMENT_ENABLED
    _FK_ENFORCEMENT_ENABLED = enabled


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection: object, _connection_record: object) -> None:
    """Turn on SQLite foreign-key enforcement for every connection.

    Without this PRAGMA, SQLite parses but does not enforce REFERENCES
    constraints — the FK columns work like bare integers. The listener fires
    on every new connection and is a no-op on non-SQLite drivers, so it is
    safe in mixed-driver future setups.

    The runtime flag ``_FK_ENFORCEMENT_ENABLED`` (toggled via
    ``set_sqlite_fk_enforcement``) lets a migration step turn enforcement off
    for the duration of a table rebuild.
    """
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute(
            "PRAGMA foreign_keys=ON" if _FK_ENFORCEMENT_ENABLED else "PRAGMA foreign_keys=OFF"
        )
        cursor.close()


V2_SENTINEL_TABLE = "topic"

# Re-exported for any caller importing this constant directly. Canonical
# source is :data:`app.config.RESET_DB_VAR`.
NODUS_RESET_DB_ENV = config.RESET_DB_VAR

_log = logging.getLogger("app.db")


def _reset_db_allowed() -> bool:
    """Whether the operator has explicitly opted into destructive DB rebuild."""
    return config.reset_db_allowed()


def _is_v2_schema(conn: Session) -> bool:
    """Return True if the DB already has the v2 sentinel table (topic)."""
    result = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"),
        {"name": V2_SENTINEL_TABLE},
    ).first()
    return result is not None


def _ensure_column(session: Session, table: str, column: str, ddl: str) -> None:
    """Add `column` to `table` if it isn't already present (SQLite-only)."""
    rows = session.execute(text(f"PRAGMA table_info({table})")).fetchall()
    existing = {r[1] for r in rows}
    if column in existing:
        return
    session.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
    session.commit()


def _maybe_rebuild_user_table(engine_to_use: object) -> bool:
    """Recreate the `user` table without the v1 CHECK constraint when needed.

    The v1 `user` table emitted a SQLite CHECK constraint on `role` that only
    permitted reader/writer/admin. We added a fourth value (public_reader) and
    SQLite cannot alter the existing constraint in place, so we rebuild the
    table preserving rows. Returns True if the table was rebuilt.
    """
    with Session(engine_to_use) as session:  # type: ignore[arg-type]
        row = session.execute(
            text("SELECT sql FROM sqlite_master WHERE type='table' AND name='user'")
        ).first()
        if not row or row[0] is None:
            return False
        ddl: str = row[0]
        # Already migrated: either no CHECK at all, or it includes public_reader.
        if "CHECK" not in ddl.upper() or "public_reader" in ddl:
            return False

        existing_rows = session.execute(text("SELECT * FROM user")).mappings().fetchall()
        session.execute(text("DROP TABLE user"))
        session.commit()

    user_table = SQLModel.metadata.tables.get("user")
    if user_table is None:
        return False
    user_table.create(bind=engine_to_use)  # type: ignore[arg-type]

    if existing_rows:
        with Session(engine_to_use) as session:  # type: ignore[arg-type]
            for r in existing_rows:
                payload = dict(r)
                payload.setdefault("mfa_enabled", False)
                payload.setdefault("totp_secret", None)
                cols = ", ".join(payload.keys())
                placeholders = ", ".join(f":{k}" for k in payload)
                session.execute(
                    text(f"INSERT INTO user ({cols}) VALUES ({placeholders})"),
                    payload,
                )
            session.commit()
    return True


def _apply_post_create_migrations(engine_to_use: object) -> None:
    """Hand-rolled idempotent column upgrades for tables that already exist.

    SQLModel.metadata.create_all leaves existing tables alone. When we add
    columns to `User` we need a small ALTER step or live SQLite DBs miss them.
    """
    rebuilt = _maybe_rebuild_user_table(engine_to_use)
    if rebuilt:
        # Fresh table already has all columns — skip the per-column migration.
        return
    with Session(engine_to_use) as session:  # type: ignore[arg-type]
        rows = session.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='user'")
        ).fetchall()
        if rows:
            _ensure_column(session, "user", "mfa_enabled", "mfa_enabled BOOLEAN DEFAULT 0 NOT NULL")
            _ensure_column(session, "user", "totp_secret", "totp_secret VARCHAR")
            _ensure_column(
                session,
                "user",
                "must_change_password",
                "must_change_password BOOLEAN DEFAULT 0 NOT NULL",
            )

        tech_rows = session.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='technology'")
        ).fetchall()
        if tech_rows:
            _ensure_column(session, "technology", "movement", "movement VARCHAR")
            _ensure_column(session, "technology", "created_by_id", "created_by_id VARCHAR")


def create_db_and_tables() -> None:
    """Create all database tables from SQLModel metadata.

    On SQLite, if the existing DB file lacks the v2 schema (no 'topic' table),
    the operator must explicitly opt into a destructive rebuild by setting
    ``NODUS_RESET_DB=1``. Without that flag the function raises ``RuntimeError``
    so the application fails fast instead of silently deleting local data. On
    Postgres and other server databases this destructive rebuild path is
    skipped — schema lifecycle is the operator's responsibility.
    """
    import app.models  # noqa: F401 — register every SQLModel table on metadata

    if IS_SQLITE and DB_FILE and os.path.exists(DB_FILE):
        with Session(engine) as session:
            if not _is_v2_schema(session):
                if not _reset_db_allowed():
                    raise RuntimeError(
                        f"Database at {os.path.abspath(DB_FILE)} predates the v2 "
                        "schema (no 'topic' table). Refusing to delete it. Set "
                        f"{NODUS_RESET_DB_ENV}=1 to confirm destructive rebuild, "
                        "or run `uv run python -m app.cli db reset --confirm`."
                    )
                _log.warning(
                    "%s=1 set; deleting %s and recreating empty schema. All local data is lost.",
                    NODUS_RESET_DB_ENV,
                    os.path.abspath(DB_FILE),
                )
                session.close()
                engine.dispose()
                os.remove(DB_FILE)
                new_engine = create_engine(DATABASE_URL, connect_args=_engine_connect_args)
                import app.db as _db

                _db.engine = new_engine
                SQLModel.metadata.create_all(new_engine)
                _apply_post_create_migrations(new_engine)
                return

    SQLModel.metadata.create_all(engine)
    if IS_SQLITE:
        _apply_post_create_migrations(engine)


def get_session() -> Generator[Session]:
    """Yield a database session for use as a FastAPI dependency."""
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]

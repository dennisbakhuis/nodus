"""Tests for the destructive-rebuild gate and FK pragma in `app.db`.

- `NODUS_RESET_DB=1` is required before `create_db_and_tables` will delete
  a legacy database file.
- Every SQLite connection has `PRAGMA foreign_keys=ON` set automatically
  via a SQLAlchemy event listener.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlmodel import Session, create_engine, text

from app import db as db_module


def _write_v1_database(path: Path) -> None:
    """Create a SQLite file at `path` lacking the v2 sentinel table.

    A single dummy table named `legacy_v1_marker` ensures `os.path.exists`
    reports the file but `_is_v2_schema` returns False.
    """
    eng = create_engine(f"sqlite:///{path}")
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE legacy_v1_marker (id INTEGER PRIMARY KEY)"))
    eng.dispose()


@pytest.fixture(name="legacy_db")
def legacy_db_fixture(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point app.db at a freshly-written legacy DB file in tmp_path."""
    monkeypatch.chdir(tmp_path)
    db_path = tmp_path / "radar.db"
    _write_v1_database(db_path)

    legacy_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(db_module, "DB_FILE", str(db_path))
    monkeypatch.setattr(db_module, "DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setattr(db_module, "engine", legacy_engine)
    return db_path


def test_reset_db_env_flag_truthy(monkeypatch: pytest.MonkeyPatch) -> None:
    """`_reset_db_allowed` accepts 1/true/yes/on (case-insensitive)."""
    for value in ("1", "true", "TRUE", "Yes", "on"):
        monkeypatch.setenv(db_module.NODUS_RESET_DB_ENV, value)
        assert db_module._reset_db_allowed() is True
    monkeypatch.delenv(db_module.NODUS_RESET_DB_ENV, raising=False)
    assert db_module._reset_db_allowed() is False
    monkeypatch.setenv(db_module.NODUS_RESET_DB_ENV, "0")
    assert db_module._reset_db_allowed() is False


def test_create_db_refuses_destructive_rebuild_without_env(
    legacy_db: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Without NODUS_RESET_DB=1, a legacy DB file triggers RuntimeError, not deletion."""
    monkeypatch.delenv(db_module.NODUS_RESET_DB_ENV, raising=False)

    with pytest.raises(RuntimeError, match="NODUS_RESET_DB"):
        db_module.create_db_and_tables()

    assert legacy_db.exists(), "DB file must not be deleted when env flag is unset"


def test_create_db_rebuilds_when_env_set(
    legacy_db: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """With NODUS_RESET_DB=1, the legacy DB is replaced with a fresh v2 schema."""
    monkeypatch.setenv(db_module.NODUS_RESET_DB_ENV, "1")

    with caplog.at_level("WARNING", logger="app.db"):
        db_module.create_db_and_tables()

    assert any(
        "deleting" in record.message and "NODUS_RESET_DB" in record.message
        for record in caplog.records
    ), "expected a WARNING-level log naming NODUS_RESET_DB and the file"

    assert legacy_db.exists(), "fresh DB file must exist after rebuild"
    eng = create_engine(f"sqlite:///{legacy_db}")
    with eng.connect() as conn:
        topic = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='topic'")
        ).first()
        legacy = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='legacy_v1_marker'")
        ).first()
    eng.dispose()
    assert topic is not None, "v2 'topic' table must be created"
    assert legacy is None, "legacy_v1_marker table must be gone after rebuild"


def test_foreign_keys_pragma_enabled_on_test_session(session: Session) -> None:
    """The session fixture's in-memory engine has FK enforcement on."""
    result = session.execute(text("PRAGMA foreign_keys")).scalar()
    assert result == 1


def test_foreign_keys_pragma_enabled_on_fresh_engine(tmp_path: Path) -> None:
    """A user-created SQLite engine also gets FK enforcement (listener is global)."""
    db_path = tmp_path / "fk_check.db"
    eng = create_engine(f"sqlite:///{db_path}")
    try:
        with eng.connect() as conn:
            assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1
    finally:
        eng.dispose()


def test_foreign_keys_actually_enforce_constraints(tmp_path: Path) -> None:
    """Insert violating an FK constraint must raise IntegrityError, not silently succeed."""
    import sqlite3 as _sqlite

    db_path = tmp_path / "fk_enforce.db"
    eng = create_engine(f"sqlite:///{db_path}")
    try:
        with eng.begin() as conn:
            conn.execute(text("CREATE TABLE parent (id INTEGER PRIMARY KEY)"))
            conn.execute(
                text(
                    "CREATE TABLE child (id INTEGER PRIMARY KEY, "
                    "parent_id INTEGER REFERENCES parent(id))"
                )
            )
        with pytest.raises((Exception,)) as excinfo, eng.begin() as conn:
            conn.execute(text("INSERT INTO child (id, parent_id) VALUES (1, 999)"))
        assert "FOREIGN KEY" in str(excinfo.value).upper() or isinstance(
            excinfo.value.__cause__, _sqlite.IntegrityError
        )
    finally:
        eng.dispose()

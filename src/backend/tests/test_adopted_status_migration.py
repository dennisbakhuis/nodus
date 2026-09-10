"""Rebuilding the `technology` table when its CHECK predates the Adopted status.

SQLite writes an enum CHECK inline and cannot alter it, so a database created
before `Adopted` existed rejects the new value until the table is rebuilt.
These tests use a table whose DDL is the pre-Adopted one and assert the rebuild
both preserves rows and unblocks the new status.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, create_engine, text

from app.db import _maybe_rebuild_technology_table

LEGACY_TECHNOLOGY_DDL = """
CREATE TABLE technology (
    id VARCHAR NOT NULL,
    topic_id VARCHAR NOT NULL,
    registry_status VARCHAR(8) NOT NULL,
    current_segment_id VARCHAR,
    current_ring VARCHAR(7),
    current_factsheet_id VARCHAR,
    hero_image_id VARCHAR,
    last_assessed_at DATETIME,
    created_by_id VARCHAR,
    created_at DATETIME NOT NULL,
    movement VARCHAR,
    PRIMARY KEY (id),
    CONSTRAINT registrystatus CHECK (registry_status IN ('On Radar', 'Backlog', 'Archive')),
    CONSTRAINT ck_technology_status_ring_segment CHECK (
        (registry_status = 'On Radar' AND current_ring IS NOT NULL
         AND current_segment_id IS NOT NULL) OR
        (registry_status != 'On Radar' AND current_ring IS NULL
         AND current_segment_id IS NULL)
    )
)
"""


def _legacy_engine(tmp_path: Path) -> Engine:
    """Build a database whose `technology` table predates the Adopted status.

    Every other table is created from the current metadata so the foreign keys
    `technology` declares have somewhere to point; only `technology` itself is
    swapped for its pre-migration DDL.
    """
    import app.models  # noqa: F401 — register every table on the metadata

    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE technology"))
        conn.execute(text(LEGACY_TECHNOLOGY_DDL))
        conn.execute(
            text(
                "INSERT INTO topic (id, canonical_name, slug, "
                "not_for_external_publication, created_at) "
                "VALUES ('topic-1', 'Legacy Topic', 'legacy-topic', 0, "
                "'2026-01-01 00:00:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO technology (id, topic_id, registry_status, created_at) "
                "VALUES ('t-1', 'topic-1', 'Backlog', '2026-01-01 00:00:00')"
            )
        )
    return engine


def test_legacy_check_rejects_adopted(tmp_path: Path) -> None:
    """The pre-migration table refuses the new value, which is why we rebuild."""
    engine = _legacy_engine(tmp_path)
    with Session(engine) as session, pytest.raises(IntegrityError):
        session.execute(text("UPDATE technology SET registry_status = 'Adopted'"))
        session.commit()
    engine.dispose()


def test_rebuild_preserves_rows_and_allows_adopted(tmp_path: Path) -> None:
    """After the rebuild the row survives and Adopted is accepted."""
    engine = _legacy_engine(tmp_path)

    assert _maybe_rebuild_technology_table(engine) is True

    with Session(engine) as session:
        rows = session.execute(text("SELECT id, registry_status FROM technology")).fetchall()
        assert rows == [("t-1", "Backlog")]
        session.execute(text("UPDATE technology SET registry_status = 'Adopted'"))
        session.commit()
        after = session.execute(text("SELECT registry_status FROM technology")).scalar_one()
        assert after == "Adopted"
    engine.dispose()


def test_rebuild_is_idempotent(tmp_path: Path) -> None:
    """A second pass is a no-op once the constraint already knows Adopted."""
    engine = _legacy_engine(tmp_path)
    assert _maybe_rebuild_technology_table(engine) is True
    assert _maybe_rebuild_technology_table(engine) is False
    engine.dispose()

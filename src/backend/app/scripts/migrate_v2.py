"""Migration approach: (a) Drop & re-seed.

Drops all tables and recreates the v2 schema from SQLModel metadata.
All data is lost; re-run the seed import after this script.

This is the correct approach for the PoC: the seed data is the canonical source
of truth, so in-place migration adds complexity without benefit.

Usage:
    uv run python -m app.scripts.migrate_v2
"""

import os

from sqlmodel import SQLModel, create_engine

DATABASE_URL = "sqlite:///./radar.db"
DB_FILE = "radar.db"


def migrate() -> None:
    """Drop the existing DB file and recreate the v2 schema."""
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)
        print(f"Dropped existing database: {DB_FILE}")

    import app.models  # noqa: F401

    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    engine.dispose()
    print("v2 schema created successfully.")
    print("Run 'uv run python -m app.seed.cli import' to repopulate data.")


if __name__ == "__main__":
    migrate()

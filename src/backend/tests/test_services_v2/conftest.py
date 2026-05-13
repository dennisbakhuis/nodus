"""Shared fixtures for service-layer tests — standalone session, no FastAPI app."""

from collections.abc import Generator

import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool


@pytest.fixture(name="session")
def session_fixture() -> Generator[Session]:
    """Provide an in-memory SQLite session with all v2 tables created."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

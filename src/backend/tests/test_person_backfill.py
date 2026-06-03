"""Tests for dialect-agnostic People-profile backfill + unique index + CLI wiring."""

import argparse

from sqlalchemy import event, inspect
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.cli import _resolve_backfill_targets
from app.db import _ensure_person_profiles
from app.models.person import Person
from app.models.user import User, UserRole
from app.services.persons import get_person_for_user


def _fresh_engine() -> object:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_fks(dbapi_conn: object, _: object) -> None:
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    import app.models  # noqa: F401 — register tables

    SQLModel.metadata.create_all(engine)
    return engine


def _add_user(engine: object, username: str) -> None:
    with Session(engine) as session:  # type: ignore[arg-type]
        session.add(
            User(
                username=username,
                first_name="Test",
                last_name=username,
                role=UserRole.Reader.value,
                password_hash="x",
            )
        )
        session.commit()


def test_ensure_person_profiles_backfills_all_users() -> None:
    engine = _fresh_engine()
    _add_user(engine, "alpha")
    _add_user(engine, "beta")

    _ensure_person_profiles(engine)

    with Session(engine) as session:  # type: ignore[arg-type]
        users = session.exec(select(User)).all()
        assert len(users) == 2
        for user in users:
            assert get_person_for_user(session, user.id) is not None


def test_ensure_person_profiles_creates_unique_index() -> None:
    engine = _fresh_engine()
    _ensure_person_profiles(engine)
    index_names = {ix["name"] for ix in inspect(engine).get_indexes("person")}
    assert "uq_person_user_id" in index_names


def test_ensure_person_profiles_is_idempotent() -> None:
    engine = _fresh_engine()
    _add_user(engine, "solo")

    _ensure_person_profiles(engine)
    _ensure_person_profiles(engine)  # second run must not duplicate or crash

    with Session(engine) as session:  # type: ignore[arg-type]
        assert len(session.exec(select(Person)).all()) == 1


def test_cli_backfill_targets_include_person_profiles() -> None:
    only = argparse.Namespace(all=False, hero_images=False, person_profiles=True)
    assert _resolve_backfill_targets(only) == {"person-profiles"}

    every = argparse.Namespace(all=True, hero_images=False, person_profiles=False)
    assert "person-profiles" in _resolve_backfill_targets(every)

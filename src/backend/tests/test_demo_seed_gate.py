"""Tests for the NODUS_ENV gate around `seed_demo_users`.

Demo accounts are seeded with the well-known DEMO_PASSWORD; the gate ensures
they are only created when NODUS_ENV is 'dev' or 'test'.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session, select

from app.main import (
    DEMO_USERS,
    NODUS_ENV_VAR,
    _env_allows_demo_seeding,
    seed_demo_users,
)
from app.models.user import User


@pytest.mark.parametrize(
    "value,expected",
    [
        ("dev", True),
        ("DEV", True),
        ("test", True),
        ("Test", True),
        ("staging", False),
        ("production", False),
        ("prod", False),
        ("", False),
    ],
)
def test_env_allows_demo_seeding(
    monkeypatch: pytest.MonkeyPatch, value: str, expected: bool
) -> None:
    """Only NODUS_ENV in {dev, test} (case-insensitive) permits demo seeding."""
    if value:
        monkeypatch.setenv(NODUS_ENV_VAR, value)
    else:
        monkeypatch.delenv(NODUS_ENV_VAR, raising=False)
    assert _env_allows_demo_seeding() is expected


def test_seed_demo_users_noop_without_env(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No demo users are created when NODUS_ENV is unset."""
    monkeypatch.delenv(NODUS_ENV_VAR, raising=False)
    seed_demo_users(session)
    demo_usernames = [spec["username"] for spec in DEMO_USERS]
    found = session.exec(
        select(User).where(User.username.in_(demo_usernames))  # type: ignore[attr-defined]
    ).all()
    assert found == []


def test_seed_demo_users_creates_when_env_dev(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """All four demo users are created when NODUS_ENV=dev."""
    monkeypatch.setenv(NODUS_ENV_VAR, "dev")
    seed_demo_users(session)
    demo_usernames = [spec["username"] for spec in DEMO_USERS]
    found = session.exec(
        select(User).where(User.username.in_(demo_usernames))  # type: ignore[attr-defined]
    ).all()
    assert {u.username for u in found} == set(demo_usernames)


def test_seed_demo_users_idempotent_when_env_dev(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Re-running with env=dev does not create duplicates."""
    monkeypatch.setenv(NODUS_ENV_VAR, "dev")
    seed_demo_users(session)
    seed_demo_users(session)
    demo_usernames = [spec["username"] for spec in DEMO_USERS]
    found = session.exec(
        select(User).where(User.username.in_(demo_usernames))  # type: ignore[attr-defined]
    ).all()
    assert len(found) == len(demo_usernames)

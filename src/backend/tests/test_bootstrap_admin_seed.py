"""Tests for the env-driven `seed_bootstrap_admin` startup hook.

The hook lets operators inject a first admin via the
``NODUS_BOOTSTRAP_ADMIN_USERNAME`` / ``NODUS_BOOTSTRAP_ADMIN_PASSWORD``
env vars — used in environments where the interactive ``create-admin``
CLI cannot be reached (e.g. Azure Container Apps without exec access).
"""

from __future__ import annotations

import pytest
from sqlmodel import Session, select

from app.auth import verify_password
from app.main import (
    BOOTSTRAP_ADMIN_PASSWORD_VAR,
    BOOTSTRAP_ADMIN_USERNAME_VAR,
    seed_bootstrap_admin,
)
from app.models.user import User, UserRole


def test_noop_when_env_unset(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No user is created when neither env var is set."""
    monkeypatch.delenv(BOOTSTRAP_ADMIN_USERNAME_VAR, raising=False)
    monkeypatch.delenv(BOOTSTRAP_ADMIN_PASSWORD_VAR, raising=False)
    seed_bootstrap_admin(session)
    assert session.exec(select(User)).all() == []


def test_noop_when_only_username_set(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Username without password is treated as misconfiguration: no-op."""
    monkeypatch.setenv(BOOTSTRAP_ADMIN_USERNAME_VAR, "admin")
    monkeypatch.delenv(BOOTSTRAP_ADMIN_PASSWORD_VAR, raising=False)
    seed_bootstrap_admin(session)
    assert session.exec(select(User)).all() == []


def test_noop_when_password_empty(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Empty password is treated as unset: no-op."""
    monkeypatch.setenv(BOOTSTRAP_ADMIN_USERNAME_VAR, "admin")
    monkeypatch.setenv(BOOTSTRAP_ADMIN_PASSWORD_VAR, "")
    seed_bootstrap_admin(session)
    assert session.exec(select(User)).all() == []


def test_creates_admin_when_both_set(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A new admin user is created when both env vars are populated."""
    monkeypatch.setenv(BOOTSTRAP_ADMIN_USERNAME_VAR, "admin")
    monkeypatch.setenv(BOOTSTRAP_ADMIN_PASSWORD_VAR, "s3cret!")
    seed_bootstrap_admin(session)
    user = session.exec(select(User).where(User.username == "admin")).one()
    assert user.role == UserRole.Admin.value
    assert verify_password("s3cret!", user.password_hash)


def test_idempotent_when_user_exists(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Re-running with the user already present is a no-op (no duplicate, no overwrite)."""
    monkeypatch.setenv(BOOTSTRAP_ADMIN_USERNAME_VAR, "admin")
    monkeypatch.setenv(BOOTSTRAP_ADMIN_PASSWORD_VAR, "first-password")
    seed_bootstrap_admin(session)

    monkeypatch.setenv(BOOTSTRAP_ADMIN_PASSWORD_VAR, "different-password")
    seed_bootstrap_admin(session)

    users = session.exec(select(User).where(User.username == "admin")).all()
    assert len(users) == 1
    assert verify_password("first-password", users[0].password_hash)


def test_whitespace_username_is_ignored(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A username consisting only of whitespace is treated as unset."""
    monkeypatch.setenv(BOOTSTRAP_ADMIN_USERNAME_VAR, "   ")
    monkeypatch.setenv(BOOTSTRAP_ADMIN_PASSWORD_VAR, "s3cret!")
    seed_bootstrap_admin(session)
    assert session.exec(select(User)).all() == []

"""Tests for the AuthProvider chain in :mod:`app.auth`.

The chain is the seam at which the Entra (OIDC) provider plugs in.
These tests pin the contract:

- Providers are consulted in :data:`PROVIDERS` registration order.
- The first non-None return wins; later providers are not invoked.
- When ``NODUS_AUTH_DISABLED`` is set, :class:`AuthDisabledProvider` wins
  unconditionally — the request's Authorization header is ignored.
- API-key tokens (``ntr_`` prefix) are routed to :class:`ApiKeyProvider`,
  never to :class:`LocalSessionProvider`, and vice versa.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from sqlmodel import Session

from app import auth as auth_module
from app.auth import (
    PROVIDERS,
    ApiKeyProvider,
    AuthDisabledProvider,
    AuthProvider,
    LocalSessionProvider,
    current_user_optional,
    synthetic_admin,
)
from app.models.user import User, UserRole


def test_provider_chain_default_ordering() -> None:
    """Default registration order: AuthDisabled → ApiKey → LocalSession."""
    types = [type(p).__name__ for p in PROVIDERS]
    assert types == ["AuthDisabledProvider", "ApiKeyProvider", "LocalSessionProvider"]


def test_provider_chain_first_wins(
    session: Session,
    make_user: Callable[..., tuple[User, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A provider inserted at the front of PROVIDERS shadows later ones."""
    sentinel_user, _ = make_user(role=UserRole.Reader, username="sentinel")

    class AlwaysSentinel:
        name = "always-sentinel"

        def resolve(self, _session: Session, _auth: str | None) -> User | None:
            return sentinel_user

    monkeypatch.setattr(auth_module, "PROVIDERS", [AlwaysSentinel(), *PROVIDERS])
    # Even with no Authorization header, the inserted provider returns first.
    resolved = current_user_optional(session, authorization=None)
    assert resolved is sentinel_user


def test_provider_returns_none_falls_through(
    session: Session,
    make_user: Callable[..., tuple[User, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A provider returning None must not stop the chain — the next one runs."""
    user, token = make_user(role=UserRole.Writer, username="fallthrough")

    class NeverHandles:
        name = "never"

        def resolve(self, _session: Session, _auth: str | None) -> User | None:
            return None

    monkeypatch.setattr(auth_module, "PROVIDERS", [NeverHandles(), *PROVIDERS])
    resolved = current_user_optional(session, authorization=f"Bearer {token}")
    assert resolved is not None
    assert resolved.id == user.id


def test_auth_disabled_provider_wins_over_real_token(
    session: Session,
    make_user: Callable[..., tuple[User, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When NODUS_AUTH_DISABLED is set, the synthetic admin replaces any real user."""
    _, token = make_user(role=UserRole.Reader, username="someone")
    monkeypatch.setenv("NODUS_AUTH_DISABLED", "1")

    resolved = current_user_optional(session, authorization=f"Bearer {token}")
    assert resolved is not None
    assert resolved.username == synthetic_admin().username
    assert resolved.role == UserRole.Admin.value


def test_auth_disabled_provider_inactive_by_default(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """With no env flag, AuthDisabledProvider returns None and the chain moves on."""
    monkeypatch.delenv("NODUS_AUTH_DISABLED", raising=False)
    assert AuthDisabledProvider().resolve(session, "Bearer whatever") is None


def test_api_key_provider_ignores_non_prefixed_tokens(
    session: Session,
    make_user: Callable[..., tuple[User, str]],
) -> None:
    """Session-style tokens must not be matched against the api_key table."""
    _, token = make_user(role=UserRole.Reader, username="bob")
    # `token` here is a session token (no ntr_ prefix).
    assert ApiKeyProvider().resolve(session, f"Bearer {token}") is None


def test_local_session_provider_ignores_api_key_tokens(session: Session) -> None:
    """API-key tokens must not be matched against auth_session rows."""
    # Looks like an API key — LocalSession must decline regardless of validity.
    assert LocalSessionProvider().resolve(session, "Bearer ntr_anything") is None


def test_anonymous_request_returns_none(session: Session) -> None:
    """No Authorization header → every provider declines → None falls through."""
    resolved = current_user_optional(session, authorization=None)
    assert resolved is None


def test_auth_provider_protocol_smoke() -> None:
    """All registered providers satisfy the AuthProvider Protocol shape."""
    for provider in PROVIDERS:
        assert isinstance(provider.name, str) and provider.name
        # Protocol method existence check.
        assert callable(provider.resolve)
        # Ensure the registered providers are instances, not classes.
        assert not isinstance(provider, type)


# Silence the unused-import linter — AuthProvider is the contract under test.
_ = AuthProvider

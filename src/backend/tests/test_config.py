"""Tests for the centralized env-var accessors in ``app.config``.

Every function in :mod:`app.config` re-reads ``os.environ`` on each call so
that pytest ``monkeypatch.setenv`` interacts with it the same way the legacy
ad-hoc ``os.getenv`` calls did. These tests pin that contract.
"""

from __future__ import annotations

import pytest

from app import config


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "Yes", "on"])
def test_auth_disabled_truthy_values(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    """Every truthy spelling of NODUS_AUTH_DISABLED enables synthetic admin mode."""
    monkeypatch.setenv(config.AUTH_DISABLED_VAR, value)
    assert config.auth_disabled() is True


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "", "anything-else"])
def test_auth_disabled_falsey_values(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    """Anything outside the truthy set leaves auth enabled."""
    monkeypatch.setenv(config.AUTH_DISABLED_VAR, value)
    assert config.auth_disabled() is False


def test_auth_disabled_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """An unset env var means auth is enabled (the safe default)."""
    monkeypatch.delenv(config.AUTH_DISABLED_VAR, raising=False)
    assert config.auth_disabled() is False


@pytest.mark.parametrize(
    ("value", "expected"),
    [("dev", True), ("test", True), ("DEV", True), ("prod", False), ("", False)],
)
def test_env_allows_demo_seeding(
    monkeypatch: pytest.MonkeyPatch, value: str, expected: bool
) -> None:
    """Only NODUS_ENV ∈ {dev, test} (case-insensitive) permits demo seeding."""
    if value:
        monkeypatch.setenv(config.ENV_VAR, value)
    else:
        monkeypatch.delenv(config.ENV_VAR, raising=False)
    assert config.env_allows_demo_seeding() is expected


def test_cors_origins_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unset CORS env falls back to the vite dev-server origin."""
    monkeypatch.delenv(config.CORS_ORIGINS_VAR, raising=False)
    assert config.cors_origins() == ["http://localhost:5173"]


def test_cors_origins_comma_separated(monkeypatch: pytest.MonkeyPatch) -> None:
    """Whitespace around commas is trimmed; empty fragments are dropped."""
    monkeypatch.setenv(
        config.CORS_ORIGINS_VAR,
        "https://a.example.com,  https://b.example.com ,, https://c.example.com",
    )
    assert config.cors_origins() == [
        "https://a.example.com",
        "https://b.example.com",
        "https://c.example.com",
    ]


def test_docs_username_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(config.DOCS_USERNAME_VAR, raising=False)
    assert config.docs_username() == config.DEFAULT_DOCS_USERNAME


def test_entra_group_for_role_known(monkeypatch: pytest.MonkeyPatch) -> None:
    """Configured Entra group object IDs are returned per role."""
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_ADMIN", "00000000-0000-0000-0000-000000000aaa")
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_WRITER", "00000000-0000-0000-0000-000000000bbb")
    assert config.entra_group_for_role("admin") == "00000000-0000-0000-0000-000000000aaa"
    assert config.entra_group_for_role("Admin") == "00000000-0000-0000-0000-000000000aaa"
    assert config.entra_group_for_role("writer") == "00000000-0000-0000-0000-000000000bbb"
    assert config.entra_group_for_role("reader") == ""


def test_entra_group_for_role_unknown_role(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unknown role names yield empty without raising — keeps callers simple."""
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_ADMIN", "x")
    assert config.entra_group_for_role("notarole") == ""


def test_active_auth_mode_auth_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """NODUS_AUTH_DISABLED wins over every other auth flag."""
    monkeypatch.setenv(config.AUTH_DISABLED_VAR, "1")
    monkeypatch.setenv(config.AUTH_ENTRA_ENABLED_VAR, "1")
    assert "auth-disabled" in config.active_auth_mode()


def test_active_auth_mode_local_plus_entra(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(config.AUTH_DISABLED_VAR, raising=False)
    monkeypatch.setenv(config.AUTH_ENTRA_ENABLED_VAR, "1")
    assert config.active_auth_mode() == "local + entra"


def test_active_auth_mode_local_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(config.AUTH_DISABLED_VAR, raising=False)
    monkeypatch.delenv(config.AUTH_ENTRA_ENABLED_VAR, raising=False)
    assert config.active_auth_mode() == "local-only"


def test_iter_active_flags_redacts_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sensitive values must never appear in plaintext in startup logs."""
    monkeypatch.setenv(config.AUTH_ENTRA_CLIENT_SECRET_VAR, "super-secret")
    monkeypatch.setenv(config.DOCS_PASSWORD_VAR, "hunter2")
    monkeypatch.setenv(config.AUTH_ENTRA_TENANT_ID_VAR, "tenant-abc")
    flags = dict(config.iter_active_flags())
    assert flags[config.AUTH_ENTRA_CLIENT_SECRET_VAR] == "***"
    assert flags[config.DOCS_PASSWORD_VAR] == "***"
    assert flags[config.AUTH_ENTRA_TENANT_ID_VAR] == "tenant-abc"


def test_iter_active_flags_omits_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unset env vars must not appear in the flag iterator."""
    for var in (
        config.AUTH_DISABLED_VAR,
        config.ENV_VAR,
        config.AUTH_ENTRA_ENABLED_VAR,
        config.AUTH_ENTRA_TENANT_ID_VAR,
        config.DOCS_PASSWORD_VAR,
        config.CORS_ORIGINS_VAR,
        config.ROOT_PATH_VAR,
    ):
        monkeypatch.delenv(var, raising=False)
    names = {name for name, _ in config.iter_active_flags()}
    # Defaults that are baked in (SWAGGER_*) may legitimately appear depending
    # on the environment — but the ones we just unset must not.
    assert config.AUTH_DISABLED_VAR not in names
    assert config.ENV_VAR not in names

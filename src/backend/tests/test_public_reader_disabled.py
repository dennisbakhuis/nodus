"""Security tests for ``NODUS_PUBLIC_READER_DISABLED``.

The flag exists so an operator can deploy the radar with **no** anonymous
surface — every request must carry a Reader/Writer/Admin token. The tests in
this file pin that contract end-to-end:

- Anonymous calls to the read endpoints get ``401`` when the flag is set
  and ``200`` (current public-reader behavior) when it is unset.
- Authenticated ``public_reader`` accounts get the same ``401`` treatment
  when the flag is set.
- Higher roles (Reader / Writer / Admin) are unaffected by the flag.
- ``/api/auth/login`` refuses ``public_reader`` accounts when the flag is set,
  so the SPA never gets a "successful" login followed by a silent 401 storm.
- ``NODUS_AUTH_DISABLED`` still short-circuits — the synthetic admin is
  immune to the flag.
- ``/api/auth/config`` advertises the flag so the frontend can hide
  "browse anonymously" UI.

Centralizing these assertions in one file makes regressions in the
chokepoint (``current_user_optional`` in ``app/auth.py``) immediately
visible.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app import config
from app.models.user import User, UserRole

_READ_ENDPOINTS = (
    "/api/cycles",
    "/api/radar/current",
    "/api/topics",
)


def _enable_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    """Turn the public-reader fallback off for the rest of the test."""
    monkeypatch.delenv(config.AUTH_DISABLED_VAR, raising=False)
    monkeypatch.setenv(config.PUBLIC_READER_DISABLED_VAR, "1")


def _disable_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    """Restore the default public-reader fallback (flag unset)."""
    monkeypatch.delenv(config.PUBLIC_READER_DISABLED_VAR, raising=False)


# --- config helpers -------------------------------------------------------


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "Yes", "on"])
def test_public_reader_disabled_truthy_values(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    """Every truthy spelling activates the flag."""
    monkeypatch.setenv(config.PUBLIC_READER_DISABLED_VAR, value)
    assert config.public_reader_disabled() is True


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "", "anything-else"])
def test_public_reader_disabled_falsey_values(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    """Anything outside the truthy set leaves the public-reader fallback on."""
    monkeypatch.setenv(config.PUBLIC_READER_DISABLED_VAR, value)
    assert config.public_reader_disabled() is False


def test_public_reader_disabled_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unset env var means the public-reader surface is reachable (safe default)."""
    monkeypatch.delenv(config.PUBLIC_READER_DISABLED_VAR, raising=False)
    assert config.public_reader_disabled() is False


# --- anonymous lockdown ---------------------------------------------------


@pytest.mark.parametrize("path", _READ_ENDPOINTS)
def test_anonymous_gets_401_on_read_endpoints_when_flag_set(
    monkeypatch: pytest.MonkeyPatch, anon_client: TestClient, path: str
) -> None:
    """With the flag on, every previously-public read endpoint refuses anonymous callers."""
    _enable_flag(monkeypatch)
    response = anon_client.get(path)
    assert response.status_code == 401, (
        f"{path} returned {response.status_code} for anonymous caller; expected 401"
    )


@pytest.mark.parametrize("path", _READ_ENDPOINTS)
def test_anonymous_still_allowed_when_flag_unset(
    monkeypatch: pytest.MonkeyPatch, anon_client: TestClient, path: str
) -> None:
    """Regression guard: existing public-reader behavior is preserved when the flag is unset."""
    _disable_flag(monkeypatch)
    response = anon_client.get(path)
    assert response.status_code == 200, (
        f"{path} returned {response.status_code} anonymously; expected 200 (default mode)"
    )


# --- authenticated public_reader lockdown --------------------------------


@pytest.mark.parametrize("path", _READ_ENDPOINTS)
def test_public_reader_account_gets_401_when_flag_set(
    monkeypatch: pytest.MonkeyPatch,
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    path: str,
) -> None:
    """A live session belonging to a public_reader is rejected just like anonymous."""
    _enable_flag(monkeypatch)
    _, token = make_user(role=UserRole.PublicReader, username="locked_public")
    response = anon_client.get(path, headers=auth_header(token))
    assert response.status_code == 401, (
        f"{path} accepted a public_reader token; expected 401 with the flag set"
    )


@pytest.mark.parametrize("role", [UserRole.Reader, UserRole.Writer, UserRole.Admin])
def test_higher_roles_unaffected_by_flag(
    monkeypatch: pytest.MonkeyPatch,
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    role: UserRole,
) -> None:
    """The flag must only gate anonymous + public_reader — never Reader/Writer/Admin."""
    _enable_flag(monkeypatch)
    _, token = make_user(role=role, username=f"u_{role.value}_flagged")
    response = anon_client.get("/api/radar/current", headers=auth_header(token))
    assert response.status_code == 200, (
        f"role={role.value} got {response.status_code}; "
        "non-public roles must be unaffected by NODUS_PUBLIC_READER_DISABLED"
    )


# --- login-side enforcement ----------------------------------------------


def test_public_reader_cannot_login_when_flag_set(
    monkeypatch: pytest.MonkeyPatch,
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
) -> None:
    """A public_reader who knows their password still cannot get a session token."""
    _enable_flag(monkeypatch)
    make_user(role=UserRole.PublicReader, username="pub_login", password="hunter2")
    response = anon_client.post(
        "/api/auth/login", json={"username": "pub_login", "password": "hunter2"}
    )
    assert response.status_code == 401
    assert "public-reader" in response.json()["detail"].lower()


def test_public_reader_can_still_login_when_flag_unset(
    monkeypatch: pytest.MonkeyPatch,
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
) -> None:
    """Regression guard: default behavior (login succeeds for public_reader) is intact."""
    _disable_flag(monkeypatch)
    make_user(role=UserRole.PublicReader, username="pub_login_ok", password="hunter2")
    response = anon_client.post(
        "/api/auth/login", json={"username": "pub_login_ok", "password": "hunter2"}
    )
    assert response.status_code == 200
    assert response.json()["user"]["role"] == UserRole.PublicReader.value


# --- precedence: NODUS_AUTH_DISABLED still wins --------------------------


def test_auth_disabled_short_circuits_flag(
    monkeypatch: pytest.MonkeyPatch, anon_client: TestClient
) -> None:
    """NODUS_AUTH_DISABLED must take precedence — synthetic admin remains immune."""
    monkeypatch.setenv(config.AUTH_DISABLED_VAR, "1")
    monkeypatch.setenv(config.PUBLIC_READER_DISABLED_VAR, "1")
    response = anon_client.get("/api/radar/current")
    assert response.status_code == 200, (
        "auth-disabled mode must remain reachable even with the public-reader "
        "flag set; the synthetic admin is meant to bypass every auth check."
    )


# --- /api/auth/config surface --------------------------------------------


def test_auth_config_advertises_flag(
    monkeypatch: pytest.MonkeyPatch, anon_client: TestClient
) -> None:
    """The SPA reads this endpoint to decide whether to offer 'browse anonymously'."""
    _enable_flag(monkeypatch)
    response = anon_client.get("/api/auth/config")
    assert response.status_code == 200
    body = response.json()
    assert body["public_reader_disabled"] is True
    assert body["auth_enabled"] is True


def test_auth_config_defaults_flag_to_false(
    monkeypatch: pytest.MonkeyPatch, anon_client: TestClient
) -> None:
    _disable_flag(monkeypatch)
    response = anon_client.get("/api/auth/config")
    assert response.status_code == 200
    assert response.json()["public_reader_disabled"] is False

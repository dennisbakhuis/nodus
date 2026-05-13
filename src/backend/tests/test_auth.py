"""Tests for the auth router and role-based endpoint guards."""

from collections.abc import Callable

import pyotp
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.user import User, UserRole


def test_login_returns_token_and_profile(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
) -> None:
    """Valid credentials yield a 200 with a token and the user profile."""
    user, _ = make_user(role=UserRole.Writer, username="alice", password="hunter2")

    response = anon_client.post(
        "/api/auth/login", json={"username": "alice", "password": "hunter2"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["token"]
    assert payload["user"]["username"] == "alice"
    assert payload["user"]["role"] == "writer"
    assert payload["user"]["id"] == str(user.id)


def test_login_rejects_bad_password(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
) -> None:
    """Wrong password returns 401, not 200."""
    make_user(role=UserRole.Writer, username="alice", password="hunter2")
    response = anon_client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    assert response.status_code == 401


def test_me_returns_profile_for_authenticated_caller(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    """`/auth/me` echoes the current user's profile when a valid token is provided."""
    user, token = make_user(role=UserRole.Admin, username="ada")
    response = anon_client.get("/api/auth/me", headers=auth_header(token))
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "ada"
    assert body["role"] == "admin"
    assert body["id"] == str(user.id)


def test_me_returns_401_for_anonymous(anon_client: TestClient) -> None:
    """Anonymous callers cannot read `/auth/me`."""
    response = anon_client.get("/api/auth/me")
    assert response.status_code == 401


def test_logout_invalidates_token(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    """After logout the token can no longer be used."""
    _, token = make_user(role=UserRole.Writer)
    logout = anon_client.post("/api/auth/logout", headers=auth_header(token))
    assert logout.status_code == 204

    me = anon_client.get("/api/auth/me", headers=auth_header(token))
    assert me.status_code == 401


def test_anonymous_can_read_topics(anon_client: TestClient) -> None:
    """Read endpoints stay public for anonymous callers."""
    response = anon_client.get("/api/topics")
    assert response.status_code == 200


def test_anonymous_cannot_create_topic(anon_client: TestClient) -> None:
    """Mutating endpoints reject anonymous callers with 401."""
    response = anon_client.post(
        "/api/topics",
        json={"canonical_name": "Quantum Sensing", "force_create": True},
    )
    assert response.status_code == 401


def test_reader_cannot_create_topic(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    """Authenticated readers are forbidden from write endpoints."""
    _, token = make_user(role=UserRole.Reader)
    response = anon_client.post(
        "/api/topics",
        json={"canonical_name": "Quantum Sensing", "force_create": True},
        headers=auth_header(token),
    )
    assert response.status_code == 403


def test_writer_can_create_topic(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    """Writers and admins may use writer-gated endpoints."""
    _, token = make_user(role=UserRole.Writer)
    response = anon_client.post(
        "/api/topics",
        json={"canonical_name": "Quantum Sensing", "force_create": True},
        headers=auth_header(token),
    )
    assert response.status_code == 201


def test_writer_cannot_change_settings(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    """Settings are admin-only — writers get 403."""
    _, token = make_user(role=UserRole.Writer)
    response = anon_client.put(
        "/api/settings/radar.title",
        json={"value": "Tech Radar Test"},
        headers=auth_header(token),
    )
    assert response.status_code == 403


def test_anonymous_cannot_list_persons(anon_client: TestClient) -> None:
    """The /manage/persons endpoint exposes PII (email) — keep it writer-only."""
    response = anon_client.get("/api/manage/persons")
    assert response.status_code == 401


def test_reader_cannot_list_persons(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    """Authenticated readers also can't see PII."""
    _, token = make_user(role=UserRole.Reader)
    response = anon_client.get("/api/manage/persons", headers=auth_header(token))
    assert response.status_code == 403


def test_writer_can_list_persons(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    """Writers and admins can see the management persons list."""
    _, token = make_user(role=UserRole.Writer)
    response = anon_client.get("/api/manage/persons", headers=auth_header(token))
    assert response.status_code == 200


def test_admin_can_change_settings(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    """Admins may change global settings."""
    _, token = make_user(role=UserRole.Admin)
    response = anon_client.put(
        "/api/settings/radar.title",
        json={"value": "Tech Radar Test"},
        headers=auth_header(token),
    )
    assert response.status_code == 200
    assert response.json()["value"] == "Tech Radar Test"


def test_mfa_setup_returns_qr_and_secret(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    """/auth/mfa/setup returns a base32 secret + provisioning URI + QR data URL."""
    _, token = make_user(role=UserRole.Writer, username="mfauser")
    res = anon_client.post("/api/auth/mfa/setup", headers=auth_header(token))
    assert res.status_code == 200
    body = res.json()
    assert body["secret"]
    assert body["provisioning_uri"].startswith("otpauth://totp/")
    assert body["qr_data_url"].startswith("data:image/png;base64,")


def test_mfa_enable_then_login_requires_code(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    """End-to-end: enroll TOTP, log in with code, log in fails with bad code."""
    user, token = make_user(role=UserRole.Writer, username="mfauser", password="pw1234")

    setup = anon_client.post("/api/auth/mfa/setup", headers=auth_header(token))
    secret = setup.json()["secret"]
    code = pyotp.totp.TOTP(secret).now()

    enable = anon_client.post(
        "/api/auth/mfa/enable",
        json={"code": code},
        headers=auth_header(token),
    )
    assert enable.status_code == 200
    assert enable.json()["mfa_enabled"] is True

    # Subsequent login is now a 2-step flow.
    step1 = anon_client.post("/api/auth/login", json={"username": "mfauser", "password": "pw1234"})
    assert step1.status_code == 200
    payload = step1.json()
    assert payload["requires_mfa"] is True
    assert payload["token"] is None
    assert payload["mfa_token"]

    bad = anon_client.post(
        "/api/auth/login/mfa",
        json={"mfa_token": payload["mfa_token"], "code": "000000"},
    )
    assert bad.status_code == 401

    # Refresh user to get the persisted secret in case pyotp moved windows.
    refreshed = session.exec(select(User).where(User.username == "mfauser")).first()
    assert refreshed is not None
    fresh_code = pyotp.totp.TOTP(refreshed.totp_secret or "").now()

    # The bad attempt consumed the challenge token only on success — re-login.
    step1b = anon_client.post("/api/auth/login", json={"username": "mfauser", "password": "pw1234"})
    good = anon_client.post(
        "/api/auth/login/mfa",
        json={"mfa_token": step1b.json()["mfa_token"], "code": fresh_code},
    )
    assert good.status_code == 200
    body = good.json()
    assert body["token"]
    assert body["user"]["username"] == user.username


def test_mfa_disable_requires_password(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    """Disabling MFA requires the user's current password."""
    _, token = make_user(role=UserRole.Writer, username="mfauser2", password="pw1234")
    setup = anon_client.post("/api/auth/mfa/setup", headers=auth_header(token))
    secret = setup.json()["secret"]
    anon_client.post(
        "/api/auth/mfa/enable",
        json={"code": pyotp.totp.TOTP(secret).now()},
        headers=auth_header(token),
    )

    bad = anon_client.post(
        "/api/auth/mfa/disable",
        json={"password": "wrong"},
        headers=auth_header(token),
    )
    assert bad.status_code == 401

    good = anon_client.post(
        "/api/auth/mfa/disable",
        json={"password": "pw1234"},
        headers=auth_header(token),
    )
    assert good.status_code == 200
    assert good.json()["mfa_enabled"] is False

    refreshed = session.exec(select(User).where(User.username == "mfauser2")).first()
    assert refreshed is not None
    assert refreshed.totp_secret is None

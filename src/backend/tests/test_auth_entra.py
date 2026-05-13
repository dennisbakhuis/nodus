"""Tests for the Entra (Azure AD) OIDC provider.

Approach: never hit the network. We monkeypatch
``app.routers.auth_entra.fetch_oidc_metadata`` and ``fetch_jwks`` so the
callback can run end-to-end against a locally generated RSA key pair —
mint an ID token, validate it, JIT-provision the user, redirect to the
SPA callback URL.

Covers: discovery/metadata wiring, ID token validation (good + bad sigs),
audience/issuer/nonce checks, JIT provisioning, role assignment from the
``groups`` claim, role re-sync on re-login, group-overage fallback,
``/api/auth/config`` providers reporting, and the 404 surface when Entra
is disabled.
"""

from __future__ import annotations

import json
from collections.abc import Generator
from typing import Any
from unittest.mock import patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from joserfc import jwt
from joserfc.jwk import KeySet, RSAKey
from sqlmodel import Session, select

from app.auth_entra import (
    EntraSettings,
    EntraValidationError,
    extract_group_ids_from_claims,
    pack_oidc_state,
    role_from_group_ids,
    validate_id_token,
)
from app.models.user import User, UserRole

_TENANT_ID = "00000000-0000-0000-0000-00000000aaaa"
_CLIENT_ID = "00000000-0000-0000-0000-00000000bbbb"
_REDIRECT_URI = "https://radar.example.com/api/auth/entra/callback"


# ---------------------------------------------------------------------------
# Fixtures: RSA key pair + signing helpers
# ---------------------------------------------------------------------------


def _new_rsa_key(kid: str = "test-key-1") -> RSAKey:
    """Generate a fresh RSAKey with an explicit kid (required by joserfc)."""
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return RSAKey.import_key(pem, parameters={"kid": kid})


@pytest.fixture(name="rsa_key")
def rsa_key_fixture() -> RSAKey:
    """One fresh RSA key per test — used to sign and verify mocked ID tokens."""
    return _new_rsa_key()


@pytest.fixture(name="entra_settings")
def entra_settings_fixture() -> EntraSettings:
    return EntraSettings(
        tenant_id=_TENANT_ID,
        client_id=_CLIENT_ID,
        client_secret="test-secret",
        redirect_uri=_REDIRECT_URI,
    )


def _mint_id_token(
    rsa_key: RSAKey,
    *,
    issuer: str,
    audience: str,
    nonce: str,
    oid: str = "11111111-1111-1111-1111-111111111111",
    groups: list[str] | None = None,
    overage: bool = False,
    given_name: str = "Eve",
    family_name: str = "Engineer",
    preferred_username: str = "eve@example.com",
) -> str:
    """Sign a realistic ID token with the test RSA key."""
    payload: dict[str, Any] = {
        "iss": issuer,
        "aud": audience,
        "exp": 9999999999,
        "iat": 1000000000,
        "nbf": 1000000000,
        "oid": oid,
        "sub": oid,
        "given_name": given_name,
        "family_name": family_name,
        "name": f"{given_name} {family_name}",
        "preferred_username": preferred_username,
        "nonce": nonce,
    }
    if overage:
        payload["_claim_names"] = {"groups": "src1"}
    elif groups is not None:
        payload["groups"] = groups
    return jwt.encode({"alg": "RS256", "kid": rsa_key.kid}, payload, rsa_key)


def _public_keyset(rsa_key: RSAKey) -> KeySet:
    """Public-only KeySet matching ``rsa_key`` for validate_id_token to consume."""
    return KeySet([rsa_key])


# ---------------------------------------------------------------------------
# Pure-function tests (no FastAPI)
# ---------------------------------------------------------------------------


def test_validate_id_token_accepts_valid_token(
    rsa_key: RSAKey, entra_settings: EntraSettings
) -> None:
    token = _mint_id_token(
        rsa_key,
        issuer=entra_settings.issuer,
        audience=entra_settings.client_id,
        nonce="N",
    )
    claims = validate_id_token(
        token,
        jwks=_public_keyset(rsa_key),
        settings=entra_settings,
        expected_nonce="N",
    )
    assert claims["oid"] == "11111111-1111-1111-1111-111111111111"


def test_validate_id_token_rejects_wrong_issuer(
    rsa_key: RSAKey, entra_settings: EntraSettings
) -> None:
    token = _mint_id_token(
        rsa_key,
        issuer="https://example.com/v2.0",
        audience=entra_settings.client_id,
        nonce="N",
    )
    with pytest.raises(EntraValidationError, match="issuer"):
        validate_id_token(
            token,
            jwks=_public_keyset(rsa_key),
            settings=entra_settings,
            expected_nonce="N",
        )


def test_validate_id_token_rejects_wrong_audience(
    rsa_key: RSAKey, entra_settings: EntraSettings
) -> None:
    token = _mint_id_token(
        rsa_key,
        issuer=entra_settings.issuer,
        audience="some-other-app",
        nonce="N",
    )
    with pytest.raises(EntraValidationError, match="audience"):
        validate_id_token(
            token,
            jwks=_public_keyset(rsa_key),
            settings=entra_settings,
            expected_nonce="N",
        )


def test_validate_id_token_rejects_wrong_nonce(
    rsa_key: RSAKey, entra_settings: EntraSettings
) -> None:
    token = _mint_id_token(
        rsa_key,
        issuer=entra_settings.issuer,
        audience=entra_settings.client_id,
        nonce="GOOD",
    )
    with pytest.raises(EntraValidationError, match="nonce"):
        validate_id_token(
            token,
            jwks=_public_keyset(rsa_key),
            settings=entra_settings,
            expected_nonce="BAD",
        )


def test_validate_id_token_rejects_signature_with_wrong_key(
    rsa_key: RSAKey, entra_settings: EntraSettings
) -> None:
    other_key = _new_rsa_key(kid="test-key-2")
    token = _mint_id_token(
        other_key,
        issuer=entra_settings.issuer,
        audience=entra_settings.client_id,
        nonce="N",
    )
    with pytest.raises(EntraValidationError, match="signature|decoding"):
        validate_id_token(
            token,
            jwks=_public_keyset(rsa_key),  # validates against the WRONG key
            settings=entra_settings,
            expected_nonce="N",
        )


def test_role_from_group_ids_picks_highest_privilege(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_ADMIN", "GADM")
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_WRITER", "GWRT")
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_READER", "GRDR")
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_PUBLIC_READER", "GPUB")

    assert role_from_group_ids(["GRDR", "GADM"]) == UserRole.Admin
    assert role_from_group_ids(["GWRT", "GRDR"]) == UserRole.Writer
    assert role_from_group_ids(["GRDR"]) == UserRole.Reader
    assert role_from_group_ids(["GPUB"]) == UserRole.PublicReader


def test_role_from_group_ids_no_match_defaults_to_public_reader(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_ADMIN", "GADM")
    assert role_from_group_ids(["unrelated-group-id"]) == UserRole.PublicReader
    assert role_from_group_ids([]) == UserRole.PublicReader


def test_extract_group_ids_present() -> None:
    assert extract_group_ids_from_claims({"groups": ["a", "b"]}) == ["a", "b"]


def test_extract_group_ids_overage_returns_none() -> None:
    """Overage marker signals 'ask Graph instead'."""
    claims = {"_claim_names": {"groups": "src1"}}
    assert extract_group_ids_from_claims(claims) is None


def test_extract_group_ids_absent_returns_none() -> None:
    assert extract_group_ids_from_claims({}) is None


def test_oidc_state_round_trip() -> None:
    packed = pack_oidc_state("S1", "N1", "V1")
    from app.auth_entra import unpack_oidc_state

    assert unpack_oidc_state(packed) == {"state": "S1", "nonce": "N1", "code_verifier": "V1"}


def test_oidc_state_unpack_rejects_malformed() -> None:
    from app.auth_entra import unpack_oidc_state

    with pytest.raises(ValueError):
        unpack_oidc_state("not-json")
    with pytest.raises(ValueError):
        unpack_oidc_state(json.dumps({"state": "x"}))  # missing nonce/verifier


# ---------------------------------------------------------------------------
# Router tests: /api/auth/config + /entra/start + /entra/callback
# ---------------------------------------------------------------------------


@pytest.fixture(name="entra_env")
def entra_env_fixture(monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    """Activate Entra config for the duration of a test."""
    monkeypatch.setenv("NODUS_AUTH_ENTRA_ENABLED", "1")
    monkeypatch.setenv("NODUS_AUTH_ENTRA_TENANT_ID", _TENANT_ID)
    monkeypatch.setenv("NODUS_AUTH_ENTRA_CLIENT_ID", _CLIENT_ID)
    monkeypatch.setenv("NODUS_AUTH_ENTRA_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("NODUS_AUTH_ENTRA_REDIRECT_URI", _REDIRECT_URI)
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_ADMIN", "GADM")
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_WRITER", "GWRT")
    yield


def test_auth_config_lists_local_only_by_default(
    anon_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("NODUS_AUTH_DISABLED", raising=False)
    monkeypatch.delenv("NODUS_AUTH_ENTRA_ENABLED", raising=False)
    monkeypatch.delenv("NODUS_PUBLIC_READER_DISABLED", raising=False)
    body = anon_client.get("/api/auth/config").json()
    assert body == {
        "auth_enabled": True,
        "providers": ["local"],
        "public_reader_disabled": False,
    }


def test_auth_config_includes_entra_when_enabled(
    anon_client: TestClient, entra_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("NODUS_AUTH_DISABLED", raising=False)
    body = anon_client.get("/api/auth/config").json()
    assert body["auth_enabled"] is True
    assert body["providers"] == ["local", "entra"]


def test_auth_config_empty_providers_when_disabled(
    anon_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("NODUS_AUTH_DISABLED", "1")
    body = anon_client.get("/api/auth/config").json()
    assert body == {
        "auth_enabled": False,
        "providers": [],
        "public_reader_disabled": False,
    }


def test_entra_start_404s_when_disabled(
    anon_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("NODUS_AUTH_ENTRA_ENABLED", raising=False)
    response = anon_client.get("/api/auth/entra/start")
    assert response.status_code == 404


def test_entra_callback_404s_when_disabled(
    anon_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("NODUS_AUTH_ENTRA_ENABLED", raising=False)
    response = anon_client.get("/api/auth/entra/callback?code=x&state=y")
    assert response.status_code == 404


def test_entra_start_returns_authorize_url(anon_client: TestClient, entra_env: None) -> None:
    """The start endpoint hits discovery, builds the authorize URL, sets the cookie."""
    fake_metadata = {
        "authorization_endpoint": f"https://login.microsoftonline.com/{_TENANT_ID}/oauth2/v2.0/authorize",
        "token_endpoint": f"https://login.microsoftonline.com/{_TENANT_ID}/oauth2/v2.0/token",
        "jwks_uri": f"https://login.microsoftonline.com/{_TENANT_ID}/discovery/v2.0/keys",
    }
    with patch("app.routers.auth_entra.fetch_oidc_metadata", return_value=fake_metadata):
        response = anon_client.get("/api/auth/entra/start")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["authorize_url"].startswith(fake_metadata["authorization_endpoint"])
    assert "code_challenge" in body["authorize_url"]
    assert "state=" in body["authorize_url"]
    assert "nonce=" in body["authorize_url"]
    # Cookie was set on the response.
    set_cookie = response.headers.get("set-cookie", "")
    assert "nodus_oidc_state=" in set_cookie


def _full_metadata() -> dict[str, Any]:
    return {
        "authorization_endpoint": f"https://login.microsoftonline.com/{_TENANT_ID}/oauth2/v2.0/authorize",
        "token_endpoint": f"https://login.microsoftonline.com/{_TENANT_ID}/oauth2/v2.0/token",
        "jwks_uri": f"https://login.microsoftonline.com/{_TENANT_ID}/discovery/v2.0/keys",
    }


def _set_state_cookie(client: TestClient, state: str, nonce: str, verifier: str) -> None:
    """Set the OIDC state cookie on the test client.

    Replaces the deprecated per-request ``cookies=`` kwarg with client-level
    cookie state — starlette flagged the per-request form for removal.
    """
    client.cookies.set("nodus_oidc_state", pack_oidc_state(state, nonce, verifier))


def test_entra_callback_jit_provisions_writer_from_group(
    anon_client: TestClient,
    entra_env: None,
    session: Session,
    rsa_key: RSAKey,
    entra_settings: EntraSettings,
) -> None:
    """Happy path: first SSO login creates the User with role from group membership."""
    state, nonce, verifier = "S", "N", "V"

    id_token = _mint_id_token(
        rsa_key,
        issuer=entra_settings.issuer,
        audience=entra_settings.client_id,
        nonce=nonce,
        oid="oid-eve",
        groups=["GWRT"],  # mapped to Writer in the entra_env fixture
        preferred_username="eve@contoso.com",
    )

    _set_state_cookie(anon_client, state, nonce, verifier)
    with (
        patch("app.routers.auth_entra.fetch_oidc_metadata", return_value=_full_metadata()),
        patch("app.routers.auth_entra.fetch_jwks", return_value=_public_keyset(rsa_key)),
        patch(
            "app.routers.auth_entra.auth_entra.exchange_code_for_id_token",
            return_value=id_token,
        ),
    ):
        response = anon_client.get(
            f"/api/auth/entra/callback?code=AUTHCODE&state={state}",
            follow_redirects=False,
        )

    assert response.status_code == 302, response.text
    location = response.headers["location"]
    assert location.startswith("https://radar.example.com/auth/callback?token=")

    created = session.exec(select(User).where(User.entra_oid == "oid-eve")).one()
    assert created.role == UserRole.Writer.value
    assert created.username == "eve@contoso.com"
    assert created.first_name == "Eve"
    assert created.password_hash == ""


def test_entra_callback_resyncs_role_on_relogin(
    anon_client: TestClient,
    entra_env: None,
    session: Session,
    rsa_key: RSAKey,
    entra_settings: EntraSettings,
) -> None:
    """A user who used to be Writer in Entra but is now Admin gets promoted on next login."""
    pre = User(
        username="eve@contoso.com",
        first_name="Eve",
        last_name="Engineer",
        password_hash="",
        role=UserRole.Writer.value,
        entra_oid="oid-eve",
    )
    session.add(pre)
    session.commit()

    state, nonce, verifier = "S", "N", "V"

    id_token = _mint_id_token(
        rsa_key,
        issuer=entra_settings.issuer,
        audience=entra_settings.client_id,
        nonce=nonce,
        oid="oid-eve",
        groups=["GADM"],  # mapped to Admin
    )

    _set_state_cookie(anon_client, state, nonce, verifier)
    with (
        patch("app.routers.auth_entra.fetch_oidc_metadata", return_value=_full_metadata()),
        patch("app.routers.auth_entra.fetch_jwks", return_value=_public_keyset(rsa_key)),
        patch(
            "app.routers.auth_entra.auth_entra.exchange_code_for_id_token",
            return_value=id_token,
        ),
    ):
        response = anon_client.get(
            f"/api/auth/entra/callback?code=AUTHCODE&state={state}",
            follow_redirects=False,
        )
    assert response.status_code == 302

    session.refresh(pre)
    assert pre.role == UserRole.Admin.value


def test_entra_callback_rejects_state_mismatch(anon_client: TestClient, entra_env: None) -> None:
    _set_state_cookie(anon_client, "EXPECTED_STATE", "N", "V")
    response = anon_client.get(
        "/api/auth/entra/callback?code=x&state=WRONG_STATE",
        follow_redirects=False,
    )
    assert response.status_code == 400
    assert "state mismatch" in response.text


def test_entra_callback_requires_cookie(anon_client: TestClient, entra_env: None) -> None:
    response = anon_client.get(
        "/api/auth/entra/callback?code=x&state=y",
        follow_redirects=False,
    )
    assert response.status_code == 400
    assert "state cookie" in response.text


def test_entra_callback_rejects_tampered_token(
    anon_client: TestClient,
    entra_env: None,
    rsa_key: RSAKey,
    entra_settings: EntraSettings,
) -> None:
    """An ID token signed with the wrong key must fail validation cleanly."""
    state, nonce, verifier = "S", "N", "V"

    other_key = _new_rsa_key(kid="test-key-attacker")
    tampered = _mint_id_token(
        other_key,
        issuer=entra_settings.issuer,
        audience=entra_settings.client_id,
        nonce=nonce,
    )

    _set_state_cookie(anon_client, state, nonce, verifier)
    with (
        patch("app.routers.auth_entra.fetch_oidc_metadata", return_value=_full_metadata()),
        patch("app.routers.auth_entra.fetch_jwks", return_value=_public_keyset(rsa_key)),
        patch(
            "app.routers.auth_entra.auth_entra.exchange_code_for_id_token",
            return_value=tampered,
        ),
    ):
        response = anon_client.get(
            f"/api/auth/entra/callback?code=AUTHCODE&state={state}",
            follow_redirects=False,
        )
    assert response.status_code == 401
    assert "validation failed" in response.text.lower()


def test_entra_callback_auth_disabled_short_circuits_entra(
    anon_client: TestClient,
    entra_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """NODUS_AUTH_DISABLED wins: even with Entra configured, callback may run but
    bearer auth is short-circuited to synthetic admin elsewhere. Here we just
    verify that /api/auth/config returns auth_enabled=false in that case."""
    monkeypatch.setenv("NODUS_AUTH_DISABLED", "1")
    body = anon_client.get("/api/auth/config").json()
    assert body == {
        "auth_enabled": False,
        "providers": [],
        "public_reader_disabled": False,
    }

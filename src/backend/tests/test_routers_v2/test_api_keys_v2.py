"""API keys admin router + bearer-token auth integration tests."""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.auth import API_KEY_LAST_USED_DEBOUNCE, hash_token
from app.models.api_key import ApiKey
from app.models.user import User, UserRole


def _create_key(client: TestClient, **overrides) -> dict:
    payload = {"name": "smoke"} | overrides
    resp = client.post("/api/manage/api-keys", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestListEndpoint:
    def test_admin_can_list_keys(self, client: TestClient) -> None:
        resp = client.get("/api/manage/api-keys")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_reader_forbidden(
        self,
        anon_client: TestClient,
        make_user: Callable[..., tuple[User, str]],
        auth_header: Callable[[str], dict[str, str]],
    ) -> None:
        _, token = make_user(role=UserRole.Reader)
        resp = anon_client.get("/api/manage/api-keys", headers=auth_header(token))
        assert resp.status_code == 403

    def test_anonymous_unauthorized(self, anon_client: TestClient) -> None:
        resp = anon_client.get("/api/manage/api-keys")
        assert resp.status_code == 401


class TestCreateEndpoint:
    def test_create_returns_plaintext_token_once(
        self, client: TestClient, session: Session
    ) -> None:
        body = _create_key(client, name="agent-prod")
        assert body["api_key"]["name"] == "agent-prod"
        assert "token" in body and body["token"].startswith("ntr_")
        assert body["api_key"]["token_prefix"] == body["token"][:12]

        listed = client.get("/api/manage/api-keys").json()
        assert len(listed) == 1
        assert "token" not in listed[0]

        stored = session.exec(select(ApiKey)).first()
        assert stored is not None
        assert stored.token_hash != body["token"]
        assert stored.token_hash == hash_token(body["token"])

    def test_created_key_authenticates_against_me(
        self, anon_client: TestClient, client: TestClient
    ) -> None:
        body = _create_key(client, name="agent")
        token = body["token"]
        resp = anon_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["role"] == UserRole.Admin.value

    def test_create_for_target_user_inherits_role(
        self,
        anon_client: TestClient,
        client: TestClient,
        make_user: Callable[..., tuple[User, str]],
    ) -> None:
        writer, _ = make_user(role=UserRole.Writer)
        body = _create_key(client, name="writer-agent", user_id=str(writer.id))
        token = body["token"]
        resp = anon_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["role"] == UserRole.Writer.value

    def test_create_rejects_inactive_target_user(
        self,
        client: TestClient,
        make_user: Callable[..., tuple[User, str]],
        session: Session,
    ) -> None:
        user, _ = make_user(role=UserRole.Reader)
        user.is_active = False
        session.add(user)
        session.commit()
        resp = client.post(
            "/api/manage/api-keys",
            json={"name": "bad", "user_id": str(user.id)},
        )
        assert resp.status_code == 400

    def test_create_rejects_past_expires_at(self, client: TestClient) -> None:
        past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
        resp = client.post("/api/manage/api-keys", json={"name": "bad", "expires_at": past})
        assert resp.status_code == 400

    def test_create_rejects_empty_name(self, client: TestClient) -> None:
        resp = client.post("/api/manage/api-keys", json={"name": "   "})
        assert resp.status_code == 400

    def test_reader_cannot_create(
        self,
        anon_client: TestClient,
        make_user: Callable[..., tuple[User, str]],
        auth_header: Callable[[str], dict[str, str]],
    ) -> None:
        _, token = make_user(role=UserRole.Reader)
        resp = anon_client.post(
            "/api/manage/api-keys",
            json={"name": "x"},
            headers=auth_header(token),
        )
        assert resp.status_code == 403

    def test_rejects_when_auth_disabled(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("NODUS_AUTH_DISABLED", "1")
        resp = client.post("/api/manage/api-keys", json={"name": "x"})
        assert resp.status_code == 409


class TestRevokeEndpoint:
    def test_revoke_sets_revoked_at(self, anon_client: TestClient, client: TestClient) -> None:
        body = _create_key(client, name="to-revoke")
        key_id = body["api_key"]["id"]
        token = body["token"]

        resp = client.delete(f"/api/manage/api-keys/{key_id}")
        assert resp.status_code == 200
        assert resp.json()["revoked_at"] is not None

        check = anon_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert check.status_code == 401

    def test_revoke_idempotent(self, client: TestClient) -> None:
        body = _create_key(client, name="x")
        key_id = body["api_key"]["id"]
        first = client.delete(f"/api/manage/api-keys/{key_id}").json()
        second = client.delete(f"/api/manage/api-keys/{key_id}").json()
        assert first["revoked_at"] == second["revoked_at"]

    def test_revoke_missing_returns_404(self, client: TestClient) -> None:
        resp = client.delete("/api/manage/api-keys/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404


class TestAuthIntegration:
    def test_expired_key_rejected(
        self,
        anon_client: TestClient,
        client: TestClient,
        session: Session,
    ) -> None:
        body = _create_key(client, name="exp")
        token = body["token"]
        key_id = uuid.UUID(body["api_key"]["id"])
        row = session.get(ApiKey, key_id)
        assert row is not None
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.add(row)
        session.commit()
        resp = anon_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401

    def test_last_used_at_debounced(
        self,
        anon_client: TestClient,
        client: TestClient,
        session: Session,
    ) -> None:
        body = _create_key(client, name="track")
        token = body["token"]
        key_id = uuid.UUID(body["api_key"]["id"])
        headers = {"Authorization": f"Bearer {token}"}

        assert anon_client.get("/api/auth/me", headers=headers).status_code == 200
        session.expire_all()
        row = session.get(ApiKey, key_id)
        assert row is not None and row.last_used_at is not None
        first_used = row.last_used_at

        assert anon_client.get("/api/auth/me", headers=headers).status_code == 200
        session.expire_all()
        row = session.get(ApiKey, key_id)
        assert row is not None
        assert row.last_used_at == first_used

        row.last_used_at = first_used - API_KEY_LAST_USED_DEBOUNCE - timedelta(seconds=1)
        rolled_back = row.last_used_at
        session.add(row)
        session.commit()

        assert anon_client.get("/api/auth/me", headers=headers).status_code == 200
        session.expire_all()
        row = session.get(ApiKey, key_id)
        assert row is not None and row.last_used_at is not None
        assert row.last_used_at > rolled_back

    def test_inactive_user_key_rejected(
        self,
        anon_client: TestClient,
        client: TestClient,
        make_user: Callable[..., tuple[User, str]],
        session: Session,
    ) -> None:
        user, _ = make_user(role=UserRole.Reader)
        body = _create_key(client, name="x", user_id=str(user.id))
        token = body["token"]
        user.is_active = False
        session.add(user)
        session.commit()
        resp = anon_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401

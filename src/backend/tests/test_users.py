"""Tests for admin user management: hard delete, profile edits, Entra config."""

import uuid
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.api_key import ApiKey
from app.models.auth_session import AuthSession
from app.models.media_asset import MediaAsset
from app.models.person import Person
from app.models.user import User, UserRole


def _make_entra_user(session: Session, *, oid: str = "entra-oid-1") -> User:
    user = User(
        username=f"entra_{oid}",
        first_name="Ext",
        last_name="Ernal",
        password_hash="",
        role=UserRole.Reader.value,
        entra_oid=oid,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_delete_user_removes_row_and_dependents(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    """Hard delete removes the user, their sessions and API keys, and unlinks
    the optional Person/MediaAsset back-pointers (those rows survive)."""
    admin, admin_token = make_user(role=UserRole.Admin)
    victim, victim_token = make_user(role=UserRole.Writer)

    session.add(
        ApiKey(
            token_hash="h1",
            token_prefix="ntr_aaaa",
            user_id=victim.id,
            name="owned",
            created_by_user_id=admin.id,
        )
    )
    session.add(
        ApiKey(
            token_hash="h2",
            token_prefix="ntr_bbbb",
            user_id=admin.id,
            name="created-by-victim",
            created_by_user_id=victim.id,
        )
    )
    person = Person(full_name="Linked Person", company="ACME", user_id=victim.id)
    asset = MediaAsset(
        content_type="image/png",
        data=b"png",
        width_px=1,
        height_px=1,
        byte_size=3,
        uploaded_by_user_id=victim.id,
    )
    session.add(person)
    session.add(asset)
    session.commit()
    person_id = person.id
    asset_id = asset.id

    response = anon_client.delete(f"/api/admin/users/{victim.id}", headers=auth_header(admin_token))
    assert response.status_code == 200
    assert response.json()["id"] == str(victim.id)

    assert session.get(User, victim.id) is None
    assert session.exec(select(AuthSession).where(AuthSession.user_id == victim.id)).all() == []
    assert (
        session.exec(
            select(ApiKey).where(
                (ApiKey.user_id == victim.id) | (ApiKey.created_by_user_id == victim.id)
            )
        ).all()
        == []
    )
    refreshed_person = session.get(Person, person_id)
    assert refreshed_person is not None and refreshed_person.user_id is None
    refreshed_asset = session.get(MediaAsset, asset_id)
    assert refreshed_asset is not None and refreshed_asset.uploaded_by_user_id is None


def test_delete_user_404_for_missing(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    response = anon_client.delete(
        f"/api/admin/users/{uuid.uuid4()}", headers=auth_header(admin_token)
    )
    assert response.status_code == 404


def test_cannot_delete_self(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    admin, admin_token = make_user(role=UserRole.Admin)
    response = anon_client.delete(f"/api/admin/users/{admin.id}", headers=auth_header(admin_token))
    assert response.status_code == 409


def test_admin_can_delete_peer_admin(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    """An admin may delete another admin while they themselves remain active."""
    admin, admin_token = make_user(role=UserRole.Admin)
    other_admin, _ = make_user(role=UserRole.Admin)
    response = anon_client.delete(
        f"/api/admin/users/{other_admin.id}", headers=auth_header(admin_token)
    )
    assert response.status_code == 200
    assert session.get(User, other_admin.id) is None


def test_update_username_success_and_clash(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    alice, _ = make_user(role=UserRole.Writer, username="alice")
    bob, _ = make_user(role=UserRole.Writer, username="bob")

    renamed = anon_client.patch(
        f"/api/admin/users/{alice.id}",
        json={"username": "alice2", "first_name": "Alice", "last_name": "A"},
        headers=auth_header(admin_token),
    )
    assert renamed.status_code == 200
    assert renamed.json()["username"] == "alice2"

    clash = anon_client.patch(
        f"/api/admin/users/{alice.id}",
        json={"username": "bob"},
        headers=auth_header(admin_token),
    )
    assert clash.status_code == 409


def test_cannot_edit_entra_user_profile(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    session: Session,
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    entra_user = _make_entra_user(session)
    response = anon_client.patch(
        f"/api/admin/users/{entra_user.id}",
        json={"first_name": "Renamed"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 409


def test_entra_admin_config_requires_admin(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    assert anon_client.get("/api/auth/entra/admin/config").status_code == 401
    _, writer_token = make_user(role=UserRole.Writer)
    assert (
        anon_client.get(
            "/api/auth/entra/admin/config", headers=auth_header(writer_token)
        ).status_code
        == 403
    )


def test_entra_admin_config_returns_group_map(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
    monkeypatch,
) -> None:
    monkeypatch.setenv("NODUS_AUTH_ENTRA_ENABLED", "1")
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_ADMIN", "group-admin")
    monkeypatch.setenv("NODUS_AUTH_ENTRA_GROUP_WRITER", "group-writer")
    _, admin_token = make_user(role=UserRole.Admin)

    response = anon_client.get("/api/auth/entra/admin/config", headers=auth_header(admin_token))
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    mapping = {g["role"]: g["group_id"] for g in body["groups"]}
    assert mapping == {"admin": "group-admin", "writer": "group-writer"}


def test_cannot_create_user_with_public_reader_role(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    """public_reader is the implicit anonymous role and must not be assignable."""
    _, admin_token = make_user(role=UserRole.Admin)
    response = anon_client.post(
        "/api/admin/users",
        headers=auth_header(admin_token),
        json={
            "username": "newbie",
            "first_name": "New",
            "last_name": "Bie",
            "role": "public_reader",
            "initial_password": "secret123",
        },
    )
    assert response.status_code == 400
    assert "public_reader" in response.json()["detail"]


def test_cannot_update_user_role_to_public_reader(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    target, _ = make_user(role=UserRole.Reader)
    response = anon_client.patch(
        f"/api/admin/users/{target.id}",
        headers=auth_header(admin_token),
        json={"role": "public_reader"},
    )
    assert response.status_code == 400
    assert "public_reader" in response.json()["detail"]


def test_assignable_roles_still_accepted(
    anon_client: TestClient,
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> None:
    _, admin_token = make_user(role=UserRole.Admin)
    for role in ("reader", "writer", "admin"):
        response = anon_client.post(
            "/api/admin/users",
            headers=auth_header(admin_token),
            json={
                "username": f"acc_{role}",
                "first_name": "Acc",
                "last_name": "Ount",
                "role": role,
                "initial_password": "secret123",
            },
        )
        assert response.status_code == 201, response.text
        assert response.json()["role"] == role

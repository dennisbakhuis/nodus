"""Admin /admin/users router tests — last-active-admin guards."""

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.user import User, UserRole


def _only_admin_left(session: Session, keep_username: str) -> None:
    """Deactivate every admin except the one named ``keep_username``."""
    rows = session.exec(
        select(User).where(User.role == UserRole.Admin.value).where(User.is_active == True)  # noqa: E712
    ).all()
    for row in rows:
        if row.username != keep_username:
            row.is_active = False
            session.add(row)
    session.commit()


def test_patch_self_deactivate_admin_blocked(
    client: TestClient,
    session: Session,
) -> None:
    """An admin cannot deactivate themselves — even when other admins exist."""
    me = session.exec(select(User).where(User.username == "default_admin")).one()
    resp = client.patch(f"/api/admin/users/{me.id}", json={"is_active": False})
    assert resp.status_code == 409, resp.text
    assert "themselves" in resp.json()["detail"].lower()


def test_patch_demote_last_admin_blocked(
    client: TestClient,
    session: Session,
) -> None:
    """The role-change branch refuses to demote the last active admin."""
    _only_admin_left(session, keep_username="default_admin")
    me = session.exec(select(User).where(User.username == "default_admin")).one()
    resp = client.patch(f"/api/admin/users/{me.id}", json={"role": "writer"})
    assert resp.status_code == 409, resp.text
    assert "last active admin" in resp.json()["detail"].lower()


def test_patch_demote_admin_allowed_when_other_admins_exist(
    client: TestClient,
    session: Session,
    make_user: Callable[..., tuple[User, str]],
) -> None:
    """Demoting an admin is fine while another active admin remains."""
    make_user(role=UserRole.Admin, username="second_admin")
    me = session.exec(select(User).where(User.username == "default_admin")).one()
    resp = client.patch(f"/api/admin/users/{me.id}", json={"role": "writer"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "writer"


def test_delete_self_blocked(
    client: TestClient,
    session: Session,
) -> None:
    """DELETE on self is refused (admins cannot deactivate themselves)."""
    me = session.exec(select(User).where(User.username == "default_admin")).one()
    resp = client.delete(f"/api/admin/users/{me.id}")
    assert resp.status_code == 409, resp.text
    assert "themselves" in resp.json()["detail"].lower()

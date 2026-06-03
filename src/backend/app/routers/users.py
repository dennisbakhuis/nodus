"""Admin user management — list, create, update profile/role/active, reset password, delete."""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.auth import AdminDep, hash_password
from app.db import SessionDep
from app.models.api_key import ApiKey
from app.models.auth_session import AuthSession
from app.models.media_asset import MediaAsset
from app.models.mfa_challenge import MfaChallenge
from app.models.person import Person
from app.models.user import User, UserRole
from app.schemas.user import (
    UserAdminCreate,
    UserAdminRead,
    UserAdminUpdate,
    UserPasswordReset,
)
from app.time_utils import now_utc

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


_VALID_ROLES = {r.value for r in UserRole}


def _validate_role(role: str) -> None:
    if role not in _VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown role '{role}'. Valid: {sorted(_VALID_ROLES)}",
        )


@router.get("", response_model=list[UserAdminRead])
def list_users(session: SessionDep, _admin: AdminDep) -> list[UserAdminRead]:
    """Return every user (active and inactive) ordered by username."""
    rows = session.exec(select(User).order_by(User.username)).all()
    return [UserAdminRead.model_validate(u) for u in rows]


@router.post("", response_model=UserAdminRead, status_code=201)
def create_user(payload: UserAdminCreate, session: SessionDep, _admin: AdminDep) -> UserAdminRead:
    """Create a new user. Username must be unique. Initial password is bcrypt-hashed."""
    _validate_role(payload.role)
    if not payload.username.strip():
        raise HTTPException(status_code=400, detail="Username cannot be empty")
    if len(payload.initial_password) < 4:
        raise HTTPException(
            status_code=400, detail="Initial password must be at least 4 characters"
        )

    clash = session.exec(select(User).where(User.username == payload.username)).first()
    if clash is not None:
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        id=uuid.uuid4(),
        username=payload.username,
        first_name=payload.first_name,
        last_name=payload.last_name,
        password_hash=hash_password(payload.initial_password),
        role=payload.role,
        is_active=True,
        mfa_enabled=False,
        must_change_password=payload.must_change_password,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserAdminRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserAdminRead)
def update_user(
    user_id: uuid.UUID,
    payload: UserAdminUpdate,
    session: SessionDep,
    admin: AdminDep,
) -> UserAdminRead:
    """Update mutable fields. Refuses to demote the last active admin or self-deactivate."""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    edits_profile = (
        payload.username is not None
        or payload.first_name is not None
        or payload.last_name is not None
    )
    if edits_profile and user.entra_oid is not None:
        raise HTTPException(
            status_code=409,
            detail="Profile of Entra-managed users is synced from Entra and cannot be edited here",
        )

    if payload.username is not None:
        new_username = payload.username.strip()
        if not new_username:
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        if new_username != user.username:
            clash = session.exec(select(User).where(User.username == new_username)).first()
            if clash is not None:
                raise HTTPException(status_code=409, detail="Username already taken")
            user.username = new_username

    if payload.role is not None:
        _validate_role(payload.role)
        if user.role == UserRole.Admin.value and payload.role != UserRole.Admin.value:
            other_admins = session.exec(
                select(User)
                .where(User.role == UserRole.Admin.value)
                .where(User.is_active == True)  # noqa: E712
                .where(User.id != user_id)
            ).all()
            if not other_admins:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot demote the last active admin",
                )
        user.role = payload.role

    if payload.is_active is not None:
        if payload.is_active is False and user.id == admin.id:
            raise HTTPException(status_code=409, detail="Admins cannot deactivate themselves")
        if payload.is_active is False and user.is_active and user.role == UserRole.Admin.value:
            other_admins = session.exec(
                select(User)
                .where(User.role == UserRole.Admin.value)
                .where(User.is_active == True)  # noqa: E712
                .where(User.id != user_id)
            ).all()
            if not other_admins:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot deactivate the last active admin",
                )
        user.is_active = payload.is_active

    if payload.first_name is not None:
        user.first_name = payload.first_name
    if payload.last_name is not None:
        user.last_name = payload.last_name

    user.updated_at = now_utc()
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserAdminRead.model_validate(user)


@router.post("/{user_id}/reset-password", response_model=UserAdminRead)
def reset_password(
    user_id: uuid.UUID,
    payload: UserPasswordReset,
    session: SessionDep,
    _admin: AdminDep,
) -> UserAdminRead:
    """Replace a user's password and (by default) require them to change it on next login."""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if len(payload.new_password) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = payload.must_change_password
    user.updated_at = now_utc()
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserAdminRead.model_validate(user)


@router.delete("/{user_id}", response_model=UserAdminRead)
def delete_user(user_id: uuid.UUID, session: SessionDep, admin: AdminDep) -> UserAdminRead:
    """Permanently delete a user, cleaning up dependent rows first.

    Deactivation (soft state) is handled via PATCH ``is_active=False``. This
    endpoint removes the account entirely: it deletes the user's auth sessions,
    in-flight MFA challenges, and API keys (those the user owns and those they
    created), and nulls the optional back-pointers on Person and MediaAsset so
    those records survive without the now-deleted user. Refuses to delete the
    last active admin or the calling admin's own account.
    """
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=409, detail="Admins cannot delete themselves")
    if user.role == UserRole.Admin.value and user.is_active:
        other_admins = session.exec(
            select(User)
            .where(User.role == UserRole.Admin.value)
            .where(User.is_active == True)  # noqa: E712
            .where(User.id != user_id)
        ).all()
        if not other_admins:
            raise HTTPException(status_code=409, detail="Cannot delete the last active admin")

    snapshot = UserAdminRead.model_validate(user)

    for auth_session in session.exec(
        select(AuthSession).where(AuthSession.user_id == user_id)
    ).all():
        session.delete(auth_session)
    for challenge in session.exec(
        select(MfaChallenge).where(MfaChallenge.user_id == user_id)
    ).all():
        session.delete(challenge)
    for api_key in session.exec(
        select(ApiKey).where((ApiKey.user_id == user_id) | (ApiKey.created_by_user_id == user_id))
    ).all():
        session.delete(api_key)
    for person in session.exec(select(Person).where(Person.user_id == user_id)).all():
        person.user_id = None
        session.add(person)
    for asset in session.exec(
        select(MediaAsset).where(MediaAsset.uploaded_by_user_id == user_id)
    ).all():
        asset.uploaded_by_user_id = None
        session.add(asset)

    session.delete(user)
    session.commit()
    return snapshot


@router.post("/me/change-password", response_model=UserAdminRead)
def change_own_password(
    payload: UserPasswordReset,
    session: SessionDep,
    admin: AdminDep,
) -> UserAdminRead:
    """Self-service password change for any authenticated admin. Clears must_change_password.

    The endpoint is gated on AdminDep purely for symmetry with the rest of this
    router; the auth router exposes the user-facing equivalent.
    """
    if len(payload.new_password) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters")
    admin.password_hash = hash_password(payload.new_password)
    admin.must_change_password = False
    admin.updated_at = now_utc()
    session.add(admin)
    session.commit()
    session.refresh(admin)
    return UserAdminRead.model_validate(admin)

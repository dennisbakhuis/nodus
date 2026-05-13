"""Admin user management — list, create, update role/active, reset password, deactivate."""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.auth import AdminDep, hash_password
from app.db import SessionDep
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
def deactivate_user(user_id: uuid.UUID, session: SessionDep, admin: AdminDep) -> UserAdminRead:
    """Soft-delete (deactivate). Hard delete is intentionally CLI-only to preserve audit trails."""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=409, detail="Admins cannot deactivate themselves")
    if user.role == UserRole.Admin.value and user.is_active:
        other_admins = session.exec(
            select(User)
            .where(User.role == UserRole.Admin.value)
            .where(User.is_active == True)  # noqa: E712
            .where(User.id != user_id)
        ).all()
        if not other_admins:
            raise HTTPException(status_code=409, detail="Cannot deactivate the last active admin")
    user.is_active = False
    user.updated_at = now_utc()
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserAdminRead.model_validate(user)


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

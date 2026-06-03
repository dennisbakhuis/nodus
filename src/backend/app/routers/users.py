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
from app.models.topic_person_link import TopicPersonLink
from app.models.user import User, UserRole
from app.schemas.person import PersonReadManagement
from app.schemas.user import (
    UserAdminCreate,
    UserAdminRead,
    UserAdminUpdate,
    UserDeleteOptions,
    UserLinkedPersonRead,
    UserPasswordReset,
)
from app.services.persons import (
    count_topic_links_for_person,
    ensure_person_for_user,
    find_unlinked_person_candidates,
    get_person_for_user,
)
from app.time_utils import now_utc

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


_VALID_ROLES = {r.value for r in UserRole}


_ASSIGNABLE_ROLES = _VALID_ROLES - {UserRole.PublicReader.value}


def _validate_role(role: str) -> None:
    """Validate an account role for assignment.

    `public_reader` is the implicit role of anonymous, not-logged-in visitors and
    must never be stored on an account, so it is rejected here even though it is a
    valid `UserRole` value.
    """
    if role == UserRole.PublicReader.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Role 'public_reader' is the implicit role for anonymous visitors "
                "and cannot be assigned to an account."
            ),
        )
    if role not in _ASSIGNABLE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown role '{role}'. Valid: {sorted(_ASSIGNABLE_ROLES)}",
        )


@router.get("", response_model=list[UserAdminRead])
def list_users(session: SessionDep, _admin: AdminDep) -> list[UserAdminRead]:
    """Return every user (active and inactive) ordered by username."""
    rows = session.exec(select(User).order_by(User.username)).all()
    return [UserAdminRead.model_validate(u) for u in rows]


@router.post("", response_model=UserAdminRead, status_code=201)
def create_user(payload: UserAdminCreate, session: SessionDep, _admin: AdminDep) -> UserAdminRead:
    """Create a new user, attaching a linked People profile.

    Username must be unique; the initial password is bcrypt-hashed. The account
    gets a linked Person: an explicitly chosen ``person_id`` is linked, otherwise
    a fresh profile is created — unless an account-less Person with the same name
    already exists and the caller hasn't resolved it (409 with candidates).
    """
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

    full_name = f"{payload.first_name} {payload.last_name}".strip()
    link_person_id: uuid.UUID | None = None
    if payload.person_id is not None:
        person = session.get(Person, payload.person_id)
        if person is None:
            raise HTTPException(status_code=404, detail="Person to link not found")
        if person.user_id is not None:
            raise HTTPException(
                status_code=409, detail="That person is already linked to an account"
            )
        link_person_id = payload.person_id
    elif not payload.create_new_person:
        candidates = find_unlinked_person_candidates(session, full_name)
        if candidates:
            raise HTTPException(
                status_code=409,
                detail={
                    "reason": "person_match",
                    "candidates": [
                        PersonReadManagement.model_validate(p).model_dump(mode="json")
                        for p in candidates
                    ],
                },
            )

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

    if link_person_id is not None:
        person = session.get(Person, link_person_id)
        if person is not None:
            person.user_id = user.id
            session.add(person)
            session.commit()
    else:
        ensure_person_for_user(session, user)

    return UserAdminRead.model_validate(user)


@router.get("/person-candidates", response_model=list[PersonReadManagement])
def person_candidates(
    first_name: str, last_name: str, session: SessionDep, _admin: AdminDep
) -> list[PersonReadManagement]:
    """Account-less People matching a name — drives the create-time link prompt."""
    full_name = f"{first_name} {last_name}".strip()
    return [
        PersonReadManagement.model_validate(p)
        for p in find_unlinked_person_candidates(session, full_name)
    ]


@router.get("/{user_id}/person", response_model=UserLinkedPersonRead)
def user_linked_person(
    user_id: uuid.UUID, session: SessionDep, _admin: AdminDep
) -> UserLinkedPersonRead:
    """The user's linked Person plus its topic-link count, for the delete dialog."""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    person = get_person_for_user(session, user_id)
    return UserLinkedPersonRead(
        person=PersonReadManagement.model_validate(person) if person is not None else None,
        topic_link_count=count_topic_links_for_person(session, person.id) if person else 0,
    )


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
def delete_user(
    user_id: uuid.UUID,
    session: SessionDep,
    admin: AdminDep,
    payload: UserDeleteOptions | None = None,
) -> UserAdminRead:
    """Permanently delete a user, cleaning up dependent rows first.

    Deactivation (soft state) is handled via PATCH ``is_active=False``. This
    endpoint removes the account entirely: it deletes the user's auth sessions,
    in-flight MFA challenges, and API keys (those the user owns and those they
    created). The linked People record is handled per ``payload.person_action``:
    ``keep`` (default) unlinks it and appends an optional ``note``; ``delete``
    removes it too (rejected with the topic-link count unless
    ``force_unlink_topics`` is set). MediaAsset back-pointers are always nulled.
    Refuses to delete the last active admin or the calling admin's own account.
    """
    opts = payload or UserDeleteOptions()
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
    linked_persons = list(session.exec(select(Person).where(Person.user_id == user_id)).all())

    if opts.person_action == "delete":
        total_links = sum(count_topic_links_for_person(session, p.id) for p in linked_persons)
        if total_links > 0 and not opts.force_unlink_topics:
            raise HTTPException(
                status_code=409,
                detail={"reason": "person_in_use", "topic_link_count": total_links},
            )

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

    note = (opts.note or "").strip()
    if opts.person_action == "delete":
        # Drop topic links first and flush, so the person row's FK dependents are
        # gone before the person DELETE is emitted.
        for person in linked_persons:
            for link in session.exec(
                select(TopicPersonLink).where(TopicPersonLink.person_id == person.id)
            ).all():
                session.delete(link)
        session.flush()
        for person in linked_persons:
            session.delete(person)
    else:
        for person in linked_persons:
            person.user_id = None
            if note:
                person.notes = f"{person.notes}\n{note}" if person.notes else note
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

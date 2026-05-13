"""Admin-only management of long-lived API keys.

API keys are bearer credentials with the ``ntr_`` prefix that act as the user
identified by ``user_id`` (typically a regular User row) and inherit that
user's role at request time. The plaintext token is returned exactly once,
in the POST response; afterwards only the SHA-256 ``token_hash`` and a short
``token_prefix`` are persisted. Revocation is a soft delete.
"""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.auth import (
    AdminDep,
    auth_disabled,
    generate_api_key,
    hash_token,
)
from app.db import SessionDep
from app.models.api_key import ApiKey
from app.models.user import User
from app.schemas.api_key import ApiKeyCreate, ApiKeyCreateResponse, ApiKeyRead
from app.time_utils import now_utc

router = APIRouter(prefix="/manage/api-keys", tags=["api-keys"])


def _to_read(api_key: ApiKey, owner_username: str) -> ApiKeyRead:
    """Project an ``ApiKey`` row + its owner's username into the read schema."""
    return ApiKeyRead(
        id=api_key.id,
        name=api_key.name,
        description=api_key.description,
        token_prefix=api_key.token_prefix,
        user_id=api_key.user_id,
        owner_username=owner_username,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        expires_at=api_key.expires_at,
        revoked_at=api_key.revoked_at,
    )


@router.get("", response_model=list[ApiKeyRead])
def list_api_keys(session: SessionDep, _admin: AdminDep) -> list[ApiKeyRead]:
    """List all API keys (active and revoked) ordered by creation time desc."""
    keys = session.exec(
        select(ApiKey).order_by(ApiKey.created_at.desc())  # type: ignore[attr-defined]
    ).all()
    if not keys:
        return []
    user_ids = {k.user_id for k in keys}
    users = session.exec(select(User).where(User.id.in_(user_ids))).all()  # type: ignore[attr-defined]
    username_by_id = {u.id: u.username for u in users}
    return [_to_read(k, username_by_id.get(k.user_id, "(deleted)")) for k in keys]


@router.post(
    "",
    response_model=ApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_api_key(
    payload: ApiKeyCreate, session: SessionDep, admin: AdminDep
) -> ApiKeyCreateResponse:
    """Mint a new API key. Returns the plaintext token exactly once."""
    if auth_disabled():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot mint API keys while NODUS_AUTH_DISABLED is set; "
                "the synthetic admin has no user row to anchor the key to."
            ),
        )
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    target_user_id = payload.user_id or admin.id
    target_user = session.get(User, target_user_id)
    if target_user is None or not target_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target user not found or inactive",
        )
    if payload.expires_at is not None and payload.expires_at <= now_utc():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expires_at must be in the future",
        )

    plaintext, prefix = generate_api_key()
    api_key = ApiKey(
        token_hash=hash_token(plaintext),
        token_prefix=prefix,
        user_id=target_user.id,
        name=payload.name.strip(),
        description=payload.description,
        expires_at=payload.expires_at,
        created_by_user_id=admin.id,
    )
    session.add(api_key)
    session.commit()
    session.refresh(api_key)
    return ApiKeyCreateResponse(
        api_key=_to_read(api_key, target_user.username),
        token=plaintext,
    )


@router.delete("/{key_id}", response_model=ApiKeyRead)
def revoke_api_key(key_id: uuid.UUID, session: SessionDep, _admin: AdminDep) -> ApiKeyRead:
    """Soft-revoke an API key. Idempotent — re-revoking is a no-op."""
    api_key = session.get(ApiKey, key_id)
    if api_key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    if api_key.revoked_at is None:
        api_key.revoked_at = now_utc()
        session.add(api_key)
        session.commit()
        session.refresh(api_key)
    owner = session.get(User, api_key.user_id)
    return _to_read(api_key, owner.username if owner is not None else "(deleted)")

import uuid
from datetime import datetime

from pydantic import BaseModel


class ApiKeyRead(BaseModel):
    """Admin-surface API key record. Never includes the token hash or plaintext."""

    id: uuid.UUID
    name: str
    description: str | None
    token_prefix: str
    user_id: uuid.UUID
    owner_username: str
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None
    revoked_at: datetime | None

    model_config = {"from_attributes": True}


class ApiKeyCreate(BaseModel):
    """Request body to mint a new API key."""

    name: str
    description: str | None = None
    user_id: uuid.UUID | None = None
    expires_at: datetime | None = None


class ApiKeyCreateResponse(BaseModel):
    """Response from POST /api/manage/api-keys.

    ``token`` is the plaintext bearer credential. It is shown to the admin
    here and **never** retrievable again — there is no endpoint that returns
    it after this point.
    """

    api_key: ApiKeyRead
    token: str

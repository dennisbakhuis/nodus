import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlmodel import Field, SQLModel


class AuthSession(SQLModel, table=True):
    """Server-side session record for a Bearer token issued at login.

    The raw token is never persisted; only its SHA-256 digest. The client retains
    the raw token in localStorage and sends it as `Authorization: Bearer <token>`.
    """

    __tablename__: ClassVar[str] = "auth_session"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    token_hash: str = Field(unique=True, index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

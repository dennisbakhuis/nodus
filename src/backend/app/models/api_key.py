import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlmodel import Field, SQLModel


class ApiKey(SQLModel, table=True):
    """Long-lived bearer credential for Agents / external tools.

    Distinct from `AuthSession` (short-lived login tokens). Tokens are stored
    only as SHA-256 hashes; the plaintext is shown to the admin exactly once,
    at creation. `token_prefix` (the first ~12 characters of the plaintext)
    is persisted alongside so the admin UI can identify keys without revealing
    the secret. Each key acts as the user identified by `user_id` and inherits
    that user's role at request time. `revoked_at` is a soft-delete marker.
    """

    __tablename__: ClassVar[str] = "api_key"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    token_hash: str = Field(unique=True, index=True)
    token_prefix: str
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    name: str
    description: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_used_at: datetime | None = Field(default=None)
    expires_at: datetime | None = Field(default=None)
    revoked_at: datetime | None = Field(default=None)
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id")

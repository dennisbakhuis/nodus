import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlmodel import Field, SQLModel


class MfaChallenge(SQLModel, table=True):
    """Short-lived row issued after step 1 of an MFA login.

    Records the user awaiting second-factor verification and the deadline by
    which they must submit a valid TOTP code. The raw challenge token is never
    persisted; only its SHA-256 digest. Rows are deleted on success or expiry.
    """

    __tablename__: ClassVar[str] = "mfa_challenge"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    challenge_hash: str = Field(unique=True, index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

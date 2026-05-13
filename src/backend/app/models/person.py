import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlmodel import Field, SQLModel


class Person(SQLModel, table=True):
    """Named individual associated with topics — not a system user.

    PII note: ``email`` must never appear in public-facing API responses.
    """

    __tablename__: ClassVar[str] = "person"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    full_name: str
    email: str | None = Field(default=None)
    company: str
    department: str | None = Field(default=None)
    role: str | None = Field(default=None)
    notes: str | None = Field(default=None)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

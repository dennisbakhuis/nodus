import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlmodel import Field, SQLModel


class Topic(SQLModel, table=True):
    """Canonical concept anchor for a technology, independent of any party's assessment."""

    __tablename__: ClassVar[str] = "topic"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    canonical_name: str = Field(unique=True, index=True)
    slug: str = Field(unique=True, index=True)
    not_for_external_publication: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

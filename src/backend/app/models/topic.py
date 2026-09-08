import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlmodel import Field, SQLModel


class Topic(SQLModel, table=True):
    """Canonical concept anchor for a technology, independent of any party's assessment.

    The two ``group_*`` fields document the Topic in its role as a *parent* —
    what the family below it covers and what belongs in it. They are separate
    from the Technology factsheet on purpose: a technology group heads a family
    and is a technology, and the two need saying separately.
    """

    __tablename__: ClassVar[str] = "topic"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    canonical_name: str = Field(unique=True, index=True)
    slug: str = Field(unique=True, index=True)
    not_for_external_publication: bool = Field(default=False)
    parent_topic_id: uuid.UUID | None = Field(
        default=None, foreign_key="topic.id", index=True
    )
    group_description: str | None = Field(default=None)
    group_scope: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

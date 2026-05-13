import uuid
from typing import ClassVar

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class Alias(SQLModel, table=True):
    """Alternative name for a Topic — enables deduplication across peer radars.

    alias_name_normalised is computed on write via app.services.normalize.normalize_alias
    and uniqueness is enforced at DB level via unique index. Normalisation: lowercase,
    strip all punctuation, collapse whitespace (§5.5).
    """

    __tablename__: ClassVar[str] = "alias"
    __table_args__ = (UniqueConstraint("alias_name_normalised", name="uq_alias_name_normalised"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    topic_id: uuid.UUID = Field(foreign_key="topic.id", index=True)
    party_id: uuid.UUID | None = Field(default=None, foreign_key="party.id")
    alias_name: str
    alias_name_normalised: str
    source: str | None = Field(default=None)

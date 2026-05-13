import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlmodel import Field, SQLModel


class Source(SQLModel, table=True):
    """Attribution record for an external peer source.

    Referenced by PeerReference.source_id. Stores raw payload for audit purposes.
    v2: no technology_id FK; repointed to party_id. raw_fields renamed to raw_json.
    """

    __tablename__: ClassVar[str] = "source"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    party_id: uuid.UUID | None = Field(default=None, foreign_key="party.id")
    source_name: str
    source_url: str | None = Field(default=None)
    external_id: str | None = Field(default=None)
    scraped_at: datetime | None = Field(default=None)
    raw_json: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

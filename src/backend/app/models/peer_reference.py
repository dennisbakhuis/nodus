import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class PeerReference(SQLModel, table=True):
    """Lightweight record capturing how one peer organisation frames a Topic.

    One row per (topic_id, party_id). Stores verbatim peer labels and a short
    summary for display in the peer-references panel.
    """

    __tablename__: ClassVar[str] = "peer_reference"
    __table_args__ = (
        UniqueConstraint("topic_id", "party_id", name="uq_peer_reference_topic_party"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    topic_id: uuid.UUID = Field(foreign_key="topic.id", index=True)
    party_id: uuid.UUID = Field(foreign_key="party.id", index=True)
    source_id: uuid.UUID | None = Field(default=None, foreign_key="source.id")
    peer_title: str
    peer_ring_label: str | None = Field(default=None)
    peer_segment_label: str | None = Field(default=None)
    peer_time_to_mainstream_label: str | None = Field(default=None)
    summary: str | None = Field(default=None)
    notes: str | None = Field(default=None)
    last_imported_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PeerReferenceUrl(SQLModel, table=True):
    """A URL belonging to one PeerReference.

    Replaces the single peer_url field with a one-to-many list.
    """

    __tablename__: ClassVar[str] = "peer_reference_url"
    __table_args__ = (UniqueConstraint("peer_reference_id", "url", name="uq_peer_reference_url"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    peer_reference_id: uuid.UUID = Field(foreign_key="peer_reference.id", index=True)
    url: str
    label: str | None = Field(default=None)
    display_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

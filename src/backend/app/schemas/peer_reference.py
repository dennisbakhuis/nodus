import uuid
from datetime import datetime

from pydantic import BaseModel


class PeerReferenceUrlCreate(BaseModel):
    """Request schema for creating a PeerReferenceUrl."""

    url: str
    label: str | None = None
    display_order: int = 0


class PeerReferenceUrlRead(BaseModel):
    """Response schema for a PeerReferenceUrl."""

    id: uuid.UUID
    peer_reference_id: uuid.UUID
    url: str
    label: str | None
    display_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PeerReferenceSummary(BaseModel):
    """Lightweight PeerReference summary for radar responses."""

    id: uuid.UUID
    topic_id: uuid.UUID
    party_id: uuid.UUID
    party_name: str
    party_slug: str
    peer_title: str
    peer_ring_label: str | None
    peer_segment_label: str | None
    summary: str | None

    model_config = {"from_attributes": True}


class PeerReferenceCreate(BaseModel):
    """Request schema for creating a PeerReference."""

    party_id: uuid.UUID
    source_id: uuid.UUID | None = None
    peer_title: str
    peer_ring_label: str | None = None
    peer_segment_label: str | None = None
    peer_time_to_mainstream_label: str | None = None
    summary: str | None = None
    notes: str | None = None
    urls: list[PeerReferenceUrlCreate] = []


class PeerReferenceUpdate(BaseModel):
    """Request schema for updating mutable PeerReference fields."""

    peer_title: str | None = None
    peer_ring_label: str | None = None
    peer_segment_label: str | None = None
    peer_time_to_mainstream_label: str | None = None
    summary: str | None = None
    notes: str | None = None


class PeerReferenceRead(BaseModel):
    """Response schema for a PeerReference."""

    id: uuid.UUID
    topic_id: uuid.UUID
    party_id: uuid.UUID
    source_id: uuid.UUID | None
    peer_title: str
    peer_ring_label: str | None
    peer_segment_label: str | None
    peer_time_to_mainstream_label: str | None
    summary: str | None
    notes: str | None
    last_imported_at: datetime | None
    created_at: datetime
    updated_at: datetime
    urls: list[PeerReferenceUrlRead] = []

    model_config = {"from_attributes": True}

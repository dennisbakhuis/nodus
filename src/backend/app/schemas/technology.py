import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator, model_validator

from app.models.technology import RegistryStatus, Ring


class TopicCreate(BaseModel):
    """Request schema for creating a Topic."""

    canonical_name: str
    slug: str | None = None
    not_for_external_publication: bool = False
    force_create: bool = False
    create_technology: bool = False
    registry_status: RegistryStatus = RegistryStatus.Backlog
    current_segment_id: uuid.UUID | None = None
    current_ring: Ring | None = None


class TopicUpdate(BaseModel):
    """Request schema for updating a Topic."""

    canonical_name: str | None = None
    slug: str | None = None
    not_for_external_publication: bool | None = None


class TopicRead(BaseModel):
    """Response schema for a Topic — includes Technology summary when present."""

    id: uuid.UUID
    canonical_name: str
    slug: str
    not_for_external_publication: bool
    created_at: datetime
    technology_id: uuid.UUID | None = None
    registry_status: str | None = None
    current_ring: str | None = None
    current_segment_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class TechnologyCreate(BaseModel):
    """Request schema for creating a Technology (Nodus registry entry for a Topic)."""

    topic_id: uuid.UUID
    registry_status: RegistryStatus = RegistryStatus.Backlog
    current_segment_id: uuid.UUID | None = None
    current_ring: Ring | None = None
    hero_image_id: uuid.UUID | None = None
    force_create: bool = False


class TechnologyUpdate(BaseModel):
    """Request schema for updating Technology header fields."""

    registry_status: RegistryStatus | None = None
    current_segment_id: uuid.UUID | None = None
    current_ring: Ring | None = None
    hero_image_id: uuid.UUID | None = None
    rationale: str | None = None


class TechnologyRead(BaseModel):
    """Response schema for a Technology."""

    id: uuid.UUID
    topic_id: uuid.UUID
    registry_status: str
    current_segment_id: uuid.UUID | None
    current_ring: str | None
    current_factsheet_id: uuid.UUID | None
    hero_image_id: uuid.UUID | None
    last_assessed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AliasCreate(BaseModel):
    """Request schema for creating an Alias on a Topic."""

    alias_name: str
    party_id: uuid.UUID | None = None
    source: str | None = None


class AliasRead(BaseModel):
    """Response schema for an Alias."""

    id: uuid.UUID
    topic_id: uuid.UUID
    party_id: uuid.UUID | None
    alias_name: str
    alias_name_normalised: str
    source: str | None

    model_config = {"from_attributes": True}


class TopicCandidate(BaseModel):
    """A fuzzy-match candidate returned during dedup check."""

    topic: TopicRead
    score: float


class TopicCreateResponse(BaseModel):
    """Response when creating a Topic — may carry dedup candidates."""

    topic: TopicRead | None = None
    technology: TechnologyRead | None = None
    match_candidates: list[TopicCandidate] = []


TechnologyHeaderUpdate = TechnologyUpdate


class TriageRequest(BaseModel):
    """Request body for curator triage of a nomination."""

    decision: RegistryStatus
    segment_id: uuid.UUID | None = None
    ring: Ring | None = None
    rationale: str

    @field_validator("ring")
    @classmethod
    def ring_required_for_on_radar(cls, ring: Ring | None, info: Any) -> Ring | None:
        """Validate ring is provided when decision is OnRadar."""
        decision = info.data.get("decision")
        if decision == RegistryStatus.OnRadar and ring is None:
            raise ValueError("ring is required when decision is On Radar")
        return ring

    @model_validator(mode="after")
    def segment_required_for_on_radar(self) -> TriageRequest:
        """Validate segment_id is provided when decision is OnRadar."""
        if self.decision == RegistryStatus.OnRadar and self.segment_id is None:
            raise ValueError("segment_id is required when decision is On Radar")
        return self

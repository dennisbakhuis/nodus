import uuid
from datetime import datetime

from pydantic import BaseModel


class SourceCreate(BaseModel):
    """Request schema for creating a Source."""

    party_id: uuid.UUID | None = None
    source_name: str
    source_url: str | None = None
    external_id: str | None = None
    raw_json: str | None = None


class SourceRead(BaseModel):
    """Response schema for a Source."""

    id: uuid.UUID
    party_id: uuid.UUID | None
    source_name: str
    source_url: str | None
    external_id: str | None
    scraped_at: datetime | None
    raw_json: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

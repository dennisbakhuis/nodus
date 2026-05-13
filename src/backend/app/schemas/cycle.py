import uuid
from datetime import date

from pydantic import BaseModel, Field


class CycleCreate(BaseModel):
    """Request schema for creating a Cycle."""

    name: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date | None = None
    color: str | None = Field(default=None, min_length=1, max_length=50)


class CycleUpdate(BaseModel):
    """Request schema for partially updating a Cycle (name and/or color)."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    color: str | None = Field(default=None, min_length=1, max_length=50)


class CycleRead(BaseModel):
    """Response schema for a Cycle."""

    id: uuid.UUID
    name: str
    start_date: date
    end_date: date | None
    snapshot_json: str | None
    color: str | None

    model_config = {"from_attributes": True}

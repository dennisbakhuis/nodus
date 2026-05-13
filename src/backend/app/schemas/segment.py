import uuid

from pydantic import BaseModel, Field


class SegmentRead(BaseModel):
    """Response schema for a Segment."""

    id: uuid.UUID
    name: str
    slug: str
    display_order: int
    is_active: bool
    theme_key: str

    model_config = {"from_attributes": True}


class SegmentReadAdmin(SegmentRead):
    """Admin response schema; adds usage_count for in-use checks."""

    usage_count: int


class SegmentCreate(BaseModel):
    """Request schema for creating a Segment."""

    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=1, max_length=100)
    display_order: int | None = None
    is_active: bool = True
    theme_key: str = Field(min_length=1, max_length=50)


class SegmentUpdate(BaseModel):
    """Request schema for partial Segment updates."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    slug: str | None = Field(default=None, min_length=1, max_length=100)
    display_order: int | None = None
    is_active: bool | None = None
    theme_key: str | None = Field(default=None, min_length=1, max_length=50)


class SegmentReorderRequest(BaseModel):
    """Reorder segments by providing the desired ID order."""

    ids: list[uuid.UUID]

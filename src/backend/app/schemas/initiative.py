import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.initiative import InitiativeStatus


class InitiativeCreate(BaseModel):
    """Request schema for creating an Initiative."""

    title: str
    description: str = ""
    status: InitiativeStatus = InitiativeStatus.Idea
    contact_person_id: uuid.UUID | None = None
    display_order: int = 0


class InitiativeUpdate(BaseModel):
    """Request schema for updating an Initiative.

    Every field is optional — only provided fields are written.
    """

    title: str | None = None
    description: str | None = None
    status: InitiativeStatus | None = None
    contact_person_id: uuid.UUID | None = None
    display_order: int | None = None


class InitiativeRead(BaseModel):
    """Response schema for an Initiative."""

    id: uuid.UUID
    technology_id: uuid.UUID
    title: str
    description: str
    status: str
    contact_person_id: uuid.UUID | None
    display_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

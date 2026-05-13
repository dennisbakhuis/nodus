import uuid
from datetime import datetime

from pydantic import BaseModel


class MovementEventRead(BaseModel):
    """Response schema for a MovementEvent."""

    id: uuid.UUID
    technology_id: uuid.UUID
    event_type: str
    from_value: str | None
    to_value: str | None
    rationale: str
    timestamp: datetime

    model_config = {"from_attributes": True}

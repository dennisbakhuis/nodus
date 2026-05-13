import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.relation import RelationType


class RelationCreate(BaseModel):
    """Request schema for creating a Topic-to-Topic Relation."""

    from_topic_id: uuid.UUID
    to_topic_id: uuid.UUID
    relation_type: RelationType


class RelationRead(BaseModel):
    """Response schema for a Relation."""

    id: uuid.UUID
    from_topic_id: uuid.UUID
    to_topic_id: uuid.UUID
    relation_type: str
    created_at: datetime

    model_config = {"from_attributes": True}

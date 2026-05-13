import uuid
from typing import ClassVar

from sqlmodel import Field, SQLModel


class StrategicInnovationField(SQLModel, table=True):
    """Controlled vocabulary for cross-segment strategic-theme grouping."""

    __tablename__: ClassVar[str] = "strategic_innovation_field"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, index=True)
    slug: str = Field(unique=True, index=True)

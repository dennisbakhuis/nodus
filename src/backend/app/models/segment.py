import uuid
from typing import ClassVar

from sqlmodel import Field, SQLModel


class Segment(SQLModel, table=True):
    """Thematic sector of the radar — editable taxonomy with active flag and theme."""

    __tablename__: ClassVar[str] = "segment"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, index=True)
    slug: str = Field(unique=True, index=True)
    display_order: int
    is_active: bool = Field(default=True, nullable=False)
    theme_key: str = Field(default="dark-blue", nullable=False)

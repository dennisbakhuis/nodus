import enum
import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import Enum as SAEnum
from sqlmodel import Column, Field, SQLModel


class InitiativeStatus(enum.StrEnum):
    """Lifecycle state of an Initiative against a technology."""

    Idea = "Idea"
    Scoping = "Scoping"
    Pilot = "Pilot"
    InProduction = "InProduction"
    Paused = "Paused"
    Dropped = "Dropped"


class Initiative(SQLModel, table=True):
    """Concrete engagement of the host organisation with a technology.

    One row = one initiative (use case, pilot, programme, …), each carrying a
    status and an optional contact person.
    """

    __tablename__: ClassVar[str] = "initiative"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    technology_id: uuid.UUID = Field(foreign_key="technology.id", index=True)
    title: str
    description: str = Field(default="")
    status: str = Field(
        default=InitiativeStatus.Idea,
        sa_column=Column(
            SAEnum(
                "Idea",
                "Scoping",
                "Pilot",
                "InProduction",
                "Paused",
                "Dropped",
                name="initiative_status",
                create_constraint=True,
            ),
            nullable=False,
            default="Idea",
        ),
    )
    contact_person_id: uuid.UUID | None = Field(default=None, foreign_key="person.id", index=True)
    display_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

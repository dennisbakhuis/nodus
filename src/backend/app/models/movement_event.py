import enum
import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import Enum as SAEnum
from sqlmodel import Column, Field, SQLModel


class EventType(enum.StrEnum):
    """Append-only movement event types."""

    Added = "Added"
    Promoted = "Promoted"
    Demoted = "Demoted"
    Removed = "Removed"
    StatusChanged = "StatusChanged"
    Reactivated = "Reactivated"
    RingChanged = "RingChanged"
    SegmentChanged = "SegmentChanged"
    FactsheetEdited = "FactsheetEdited"


class MovementEvent(SQLModel, table=True):
    """Append-only audit log for Technology state changes.

    Rows are never updated or deleted. PeerReference re-imports do not generate
    MovementEvents — this log is strictly scoped to the radar's Technology lifecycle.

    `cycle_id` and `author_id` are nullable for back-compat; new rows should
    always populate both. The cycle scope is required by the Delta Document
    deliverable and the audit trail.
    """

    __tablename__: ClassVar[str] = "movement_event"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    technology_id: uuid.UUID = Field(foreign_key="technology.id", index=True)
    cycle_id: uuid.UUID | None = Field(default=None, foreign_key="cycle.id", index=True)
    author_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", index=True)
    event_type: str = Field(
        sa_column=Column(
            SAEnum(
                "Added",
                "Promoted",
                "Demoted",
                "Removed",
                "StatusChanged",
                "Reactivated",
                "RingChanged",
                "SegmentChanged",
                "FactsheetEdited",
                name="eventtype",
                create_constraint=True,
            ),
            nullable=False,
        )
    )
    from_value: str | None = Field(default=None)
    to_value: str | None = Field(default=None)
    rationale: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))

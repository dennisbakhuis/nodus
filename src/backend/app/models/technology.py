import enum
import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import UUID as SAUUID
from sqlalchemy import CheckConstraint
from sqlalchemy import Enum as SAEnum
from sqlmodel import Column, Field, SQLModel


class RegistryStatus(enum.StrEnum):
    """Registry status values — exact methodology wording (§4.5)."""

    OnRadar = "On Radar"
    Backlog = "Backlog"
    Archive = "Archive"


class Ring(enum.StrEnum):
    """Radar ring values from innermost to outermost (methodology §3)."""

    Invest = "Invest"
    Pilot = "Pilot"
    Explore = "Explore"
    Monitor = "Monitor"


class Technology(SQLModel, table=True):
    """the radar's registry entry for a Topic.

    Owns the radar's ring, segment, registry status, factsheet stream, and movement audit log.
    Exactly one Technology per Topic (or none if Topic has only peer references).

    current_factsheet_id carries a circular FK to factsheet.id. In SQLite FK enforcement
    is off by default; on PostgreSQL use a deferred FK constraint. The FK is not declared
    via SQLModel's foreign_key= to avoid circular import issues at metadata-creation time;
    it is enforced at the application layer and tested in test_models_v2.py.
    """

    __tablename__: ClassVar[str] = "technology"
    __table_args__ = (
        CheckConstraint(
            "(registry_status = 'On Radar' AND current_ring IS NOT NULL "
            "AND current_segment_id IS NOT NULL) OR "
            "(registry_status != 'On Radar' AND current_ring IS NULL "
            "AND current_segment_id IS NULL)",
            name="ck_technology_status_ring_segment",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    topic_id: uuid.UUID = Field(foreign_key="topic.id", unique=True, index=True)
    registry_status: str = Field(
        sa_column=Column(
            SAEnum(
                "On Radar",
                "Backlog",
                "Archive",
                name="registrystatus",
                create_constraint=True,
            ),
            nullable=False,
            default="Backlog",
        )
    )
    current_segment_id: uuid.UUID | None = Field(default=None, foreign_key="segment.id")
    current_ring: str | None = Field(
        default=None,
        sa_column=Column(
            SAEnum(
                "Invest",
                "Pilot",
                "Explore",
                "Monitor",
                name="ring",
                create_constraint=True,
            ),
            nullable=True,
        ),
    )
    current_factsheet_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(SAUUID(as_uuid=True), nullable=True),
    )
    hero_image_id: uuid.UUID | None = Field(default=None, foreign_key="media_asset.id")
    last_assessed_at: datetime | None = Field(default=None)
    created_by_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

import enum
import uuid
from datetime import UTC, date, datetime
from typing import ClassVar

from sqlalchemy import Enum as SAEnum
from sqlalchemy import UniqueConstraint
from sqlmodel import Column, Field, SQLModel


class TaxCreditCandidate(enum.StrEnum):
    """Generic R&D tax-credit candidacy flag."""

    Yes = "Yes"
    No = "No"
    Potential = "Potential"


class Factsheet(SQLModel, table=True):
    """Versioned technology factsheet — each edit creates a new version row.

    Lifecycle: created on each factsheet edit; never mutated in place.
    UNIQUE(technology_id, version) enforced at DB level.
    """

    __tablename__: ClassVar[str] = "factsheet"
    __table_args__ = (
        UniqueConstraint("technology_id", "version", name="uq_factsheet_technology_version"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    technology_id: uuid.UUID = Field(foreign_key="technology.id", index=True)
    version: int = Field(default=1)
    summary: str = Field(default="", max_length=120)
    description: str = Field(default="")
    key_players: str = Field(default="")
    tax_credit_candidate: str = Field(
        default=TaxCreditCandidate.No,
        sa_column=Column(
            SAEnum(
                "Yes",
                "No",
                "Potential",
                name="tax_credit_candidate",
                create_constraint=True,
            ),
            nullable=False,
            default="No",
        ),
    )
    recommended_next_steps: str = Field(default="")
    current_challenges: str = Field(default="")
    publication_links: str = Field(default="[]")
    strategic_innovation_field_id: uuid.UUID | None = Field(
        default=None, foreign_key="strategic_innovation_field.id"
    )
    author_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", index=True)
    last_updated: date = Field(default_factory=date.today)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

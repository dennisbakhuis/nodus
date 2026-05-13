import enum
import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlmodel import Column, Field, SQLModel


class ScoreHML(enum.StrEnum):
    """High / Medium / Low assessment scale."""

    High = "High"
    Medium = "Medium"
    Low = "Low"


StrategicRelevance = ScoreHML
ImplementationFeasibility = ScoreHML
CollaborationPotential = ScoreHML


class ImpactPotential(enum.StrEnum):
    """Impact potential rating."""

    Transformational = "Transformational"
    High = "High"
    Medium = "Medium"
    Low = "Low"


class TimeToMainstream(enum.StrEnum):
    """Time to mainstream adoption band.

    Stored and returned with the canonical wording including the space before 'yr'.
    """

    ZeroToTwo = "0-2 yr"
    TwoToFive = "2-5 yr"
    FiveToSeven = "5-7 yr"
    SevenToTen = "7-10 yr"


class Assessment(SQLModel, table=True):
    """Structured six-criterion scoring record attached to one Factsheet version.

    trl_phase is NOT stored — it is derived at render time:
    TRL 1-3 → Discovery; 4-6 → Development; 7-8 → Demonstration; 9 → Deployment;
    10-12 → Scale (IEA-extended).

    trl CHECK enforces 1 ≤ trl ≤ 12 (NASA 1-9 + IEA extended 10-12).
    All criterion fields are nullable because early-stage factsheets may lack full scores.
    """

    __tablename__: ClassVar[str] = "assessment"
    __table_args__ = (
        UniqueConstraint("factsheet_id", name="uq_assessment_factsheet"),
        CheckConstraint("trl IS NULL OR (trl >= 1 AND trl <= 12)", name="ck_trl_range"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    factsheet_id: uuid.UUID = Field(foreign_key="factsheet.id", unique=True)
    strategic_relevance: str | None = Field(
        default=None,
        sa_column=Column(
            SAEnum("High", "Medium", "Low", name="score_hml_strategic", create_constraint=True),
            nullable=True,
        ),
    )
    strategic_relevance_notes: str | None = Field(default=None)
    impact_potential: str | None = Field(
        default=None,
        sa_column=Column(
            SAEnum(
                "Transformational",
                "High",
                "Medium",
                "Low",
                name="score_impact",
                create_constraint=True,
            ),
            nullable=True,
        ),
    )
    impact_potential_notes: str | None = Field(default=None)
    implementation_feasibility: str | None = Field(
        default=None,
        sa_column=Column(
            SAEnum("High", "Medium", "Low", name="score_hml_feasibility", create_constraint=True),
            nullable=True,
        ),
    )
    implementation_feasibility_notes: str | None = Field(default=None)
    time_to_mainstream: str | None = Field(
        default=None,
        sa_column=Column(
            SAEnum(
                "0-2 yr",
                "2-5 yr",
                "5-7 yr",
                "7-10 yr",
                name="time_to_mainstream",
                create_constraint=True,
            ),
            nullable=True,
        ),
    )
    time_to_mainstream_notes: str | None = Field(default=None)
    collaboration_potential: str | None = Field(
        default=None,
        sa_column=Column(
            SAEnum("High", "Medium", "Low", name="score_hml_collaboration", create_constraint=True),
            nullable=True,
        ),
    )
    collaboration_potential_notes: str | None = Field(default=None)
    trl: int | None = Field(default=None)
    trl_notes: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

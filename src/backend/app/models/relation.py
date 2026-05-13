import enum
import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlmodel import Column, Field, SQLModel


class RelationType(enum.StrEnum):
    """Typed directed edge between two Topics.

    Wire-format values are snake_case; member names remain PascalCase Python
    identifiers.
    """

    Drives = "drives"
    DrivenBy = "driven_by"
    Hinders = "hinders"
    HinderedBy = "hindered_by"
    RelatesTo = "relates_to"


class Relation(SQLModel, table=True):
    """Typed directed edge between two Topics.

    Replaces v1 TechnologyRelation. Self-loops are forbidden at the DB level.
    Uniqueness on (from_topic_id, to_topic_id, relation_type).
    """

    __tablename__: ClassVar[str] = "relation"
    __table_args__ = (
        UniqueConstraint(
            "from_topic_id", "to_topic_id", "relation_type", name="uq_relation_triple"
        ),
        CheckConstraint("from_topic_id != to_topic_id", name="ck_relation_no_self_loop"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    from_topic_id: uuid.UUID = Field(foreign_key="topic.id", index=True)
    to_topic_id: uuid.UUID = Field(foreign_key="topic.id", index=True)
    relation_type: str = Field(
        sa_column=Column(
            SAEnum(
                "drives",
                "driven_by",
                "hinders",
                "hindered_by",
                "relates_to",
                name="relationtype",
                create_constraint=True,
            ),
            nullable=False,
        )
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

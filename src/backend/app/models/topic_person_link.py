import enum
import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import Enum as SAEnum
from sqlalchemy import UniqueConstraint
from sqlmodel import Column, Field, SQLModel


class PersonLinkRole(enum.StrEnum):
    """Role a Person plays on a Topic."""

    Author = "Author"
    Owner = "Owner"
    SubjectMatterExpert = "SubjectMatterExpert"
    Contact = "Contact"
    ProjectLead = "ProjectLead"


class TopicPersonLink(SQLModel, table=True):
    """M:N junction attaching a Person to a Topic with a specific role."""

    __tablename__: ClassVar[str] = "topic_person_link"
    __table_args__ = (
        UniqueConstraint("topic_id", "person_id", "link_role", name="uq_topic_person_link"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    topic_id: uuid.UUID = Field(foreign_key="topic.id", index=True)
    person_id: uuid.UUID = Field(foreign_key="person.id", index=True)
    link_role: str = Field(
        sa_column=Column(
            SAEnum(
                "Author",
                "Owner",
                "SubjectMatterExpert",
                "Contact",
                "ProjectLead",
                name="personlinkrole",
                create_constraint=True,
            ),
            nullable=False,
        )
    )
    notes: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

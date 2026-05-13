import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.topic_person_link import PersonLinkRole


class PersonCreate(BaseModel):
    """Request schema for creating a Person."""

    full_name: str
    email: str | None = None
    company: str
    department: str | None = None
    role: str | None = None
    notes: str | None = None
    user_id: uuid.UUID | None = None


class PersonUpdate(BaseModel):
    """Request schema for updating mutable Person fields."""

    full_name: str | None = None
    email: str | None = None
    company: str | None = None
    department: str | None = None
    role: str | None = None
    notes: str | None = None
    user_id: uuid.UUID | None = None


class PersonReadPublic(BaseModel):
    """Public-facing Person schema — excludes PII fields email and notes."""

    id: uuid.UUID
    full_name: str
    company: str
    department: str | None
    role: str | None

    model_config = {"from_attributes": True}


class PersonReadManagement(BaseModel):
    """Management-surface Person schema — includes all fields including PII."""

    id: uuid.UUID
    full_name: str
    email: str | None
    company: str
    department: str | None
    role: str | None
    notes: str | None
    user_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TopicPersonLinkCreate(BaseModel):
    """Request schema for linking a Person to a Topic."""

    person_id: uuid.UUID
    link_role: PersonLinkRole
    notes: str | None = None


class TopicPersonLinkUpsert(BaseModel):
    """Request schema for find-or-create-and-link in a single call.

    If `person_id` is supplied, existing person is reused. Otherwise the server
    looks up by (full_name, company); creating a new Person record on miss.
    """

    person_id: uuid.UUID | None = None
    full_name: str | None = None
    company: str | None = None
    role: str | None = None
    department: str | None = None
    email: str | None = None
    notes: str | None = None
    link_role: PersonLinkRole


class TopicPersonLinkRead(BaseModel):
    """Response schema for a TopicPersonLink."""

    id: uuid.UUID
    topic_id: uuid.UUID
    person_id: uuid.UUID
    link_role: str
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TopicPersonLinkManagementRead(BaseModel):
    """Management-surface response for a TopicPersonLink — includes full Person data."""

    id: uuid.UUID
    topic_id: uuid.UUID
    person_id: uuid.UUID
    link_role: str
    notes: str | None
    created_at: datetime
    person: PersonReadManagement

    model_config = {"from_attributes": True}

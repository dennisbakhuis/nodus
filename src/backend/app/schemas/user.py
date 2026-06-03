import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.person import PersonReadManagement


class UserMe(BaseModel):
    """Public profile of the authenticated user; never includes password_hash."""

    id: uuid.UUID
    username: str
    first_name: str
    last_name: str
    role: str
    mfa_enabled: bool = False
    must_change_password: bool = False
    profile_incomplete: bool = False

    model_config = {"from_attributes": True}


class UserAdminRead(BaseModel):
    """Admin-surface user record. Excludes password_hash and totp_secret."""

    id: uuid.UUID
    username: str
    first_name: str
    last_name: str
    role: str
    is_active: bool
    mfa_enabled: bool
    must_change_password: bool
    entra_oid: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserAdminCreate(BaseModel):
    """Request body for admin user creation.

    When the new account's name matches an existing account-less Person, the
    caller must resolve it: pass ``person_id`` to link that record, or
    ``create_new_person=True`` to deliberately create a fresh profile.
    """

    username: str
    first_name: str
    last_name: str
    role: str
    initial_password: str
    must_change_password: bool = True
    person_id: uuid.UUID | None = None
    create_new_person: bool = False


class UserAdminUpdate(BaseModel):
    """PATCH body for admin user update; only included fields are changed."""

    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    is_active: bool | None = None


class UserPasswordReset(BaseModel):
    """Admin-set new password; user is forced to change on next login by default."""

    new_password: str
    must_change_password: bool = True


class UserDeleteOptions(BaseModel):
    """Optional body for DELETE /admin/users/{id}.

    ``keep`` (default) preserves the linked Person, unlinks it from the account,
    and appends ``note`` to its notes. ``delete`` removes the Person too;
    ``force_unlink_topics`` is required when the Person is still attached to
    topics, otherwise the request is rejected with the topic-link count.
    """

    person_action: Literal["keep", "delete"] = "keep"
    note: str | None = None
    force_unlink_topics: bool = False


class UserLinkedPersonRead(BaseModel):
    """Preview of a user's linked Person for the delete dialog."""

    person: PersonReadManagement | None = None
    topic_link_count: int = 0


class SelfProfileUpdate(BaseModel):
    """PATCH body for the caller's own People profile (first-login completion)."""

    full_name: str | None = None
    company: str | None = None
    email: str | None = None
    department: str | None = None
    role: str | None = None

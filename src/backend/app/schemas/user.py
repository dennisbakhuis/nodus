import uuid
from datetime import datetime

from pydantic import BaseModel


class UserMe(BaseModel):
    """Public profile of the authenticated user; never includes password_hash."""

    id: uuid.UUID
    username: str
    first_name: str
    last_name: str
    role: str
    mfa_enabled: bool = False
    must_change_password: bool = False

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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserAdminCreate(BaseModel):
    """Request body for admin user creation."""

    username: str
    first_name: str
    last_name: str
    role: str
    initial_password: str
    must_change_password: bool = True


class UserAdminUpdate(BaseModel):
    """PATCH body for admin user update; only included fields are changed."""

    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    is_active: bool | None = None


class UserPasswordReset(BaseModel):
    """Admin-set new password; user is forced to change on next login by default."""

    new_password: str
    must_change_password: bool = True

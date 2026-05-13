import enum
import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import Enum as SAEnum
from sqlmodel import Column, Field, SQLModel


class UserRole(enum.StrEnum):
    """Application-level role for an authenticated user.

    PublicReader sees only Topics flagged as public (not_for_external_publication=False).
    Reader sees everything readable. Writer + Admin add mutating capabilities.
    """

    PublicReader = "public_reader"
    Reader = "reader"
    Writer = "writer"
    Admin = "admin"


class User(SQLModel, table=True):
    """Authenticated user. Anonymous visitors have no row and are treated as readers."""

    __tablename__: ClassVar[str] = "user"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    username: str = Field(unique=True, index=True)
    first_name: str
    last_name: str
    password_hash: str
    role: str = Field(
        sa_column=Column(
            SAEnum(
                "public_reader",
                "reader",
                "writer",
                "admin",
                name="userrole",
                create_constraint=False,
            ),
            nullable=False,
        ),
    )
    is_active: bool = Field(default=True)
    mfa_enabled: bool = Field(default=False)
    totp_secret: str | None = Field(default=None)
    must_change_password: bool = Field(default=False)
    # Microsoft Entra (Azure AD) object ID — set on first SSO login (JIT).
    # NULL for local-only users. Indexed because the OIDC callback looks
    # users up by oid on every login.
    entra_oid: str | None = Field(default=None, unique=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

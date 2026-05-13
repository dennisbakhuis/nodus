import uuid
from typing import ClassVar

from sqlmodel import Field, SQLModel


class Setting(SQLModel, table=True):
    """Generic key/value store for global app configuration (e.g. radar center logo)."""

    __tablename__: ClassVar[str] = "setting"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    key: str = Field(unique=True, index=True)
    value: str = Field(default="", nullable=False)

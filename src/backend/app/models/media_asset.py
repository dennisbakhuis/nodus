import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import LargeBinary
from sqlmodel import Column, Field, SQLModel


class MediaAsset(SQLModel, table=True):
    """Stored binary image asset uploaded by a curator (hero image).

    Bytes are stored as a BLOB in the database alongside pixel dimensions and metadata.
    Immutable after creation; replaced by uploading a new row.
    """

    __tablename__: ClassVar[str] = "media_asset"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    content_type: str
    data: bytes = Field(sa_column=Column("bytes", LargeBinary, nullable=False))
    width_px: int
    height_px: int
    alt_text: str | None = Field(default=None)
    original_filename: str | None = Field(default=None)
    byte_size: int
    uploaded_by_user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

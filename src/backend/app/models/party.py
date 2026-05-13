import uuid
from typing import ClassVar

from sqlmodel import Field, SQLModel


class Party(SQLModel, table=True):
    """Controlled-vocabulary reference table of organisations.

    Referenced by PeerReference, Source, and Alias.
    """

    __tablename__: ClassVar[str] = "party"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, index=True)
    slug: str = Field(unique=True, index=True)
    url: str | None = Field(default=None)

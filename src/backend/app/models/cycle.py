import uuid
from datetime import date
from typing import ClassVar

from sqlalchemy import Index, text
from sqlmodel import Field, SQLModel


class Cycle(SQLModel, table=True):
    """Radar cycle — a named time window for a full radar update.

    snapshot_json replaces v1 snapshot_data. Stores the serialised set of the radar's
    Technologies (radar state only) at cycle close as a JSON string.
    """

    __tablename__: ClassVar[str] = "cycle"
    __table_args__ = (
        Index(
            "ux_cycle_one_open",
            text("(CASE WHEN end_date IS NULL THEN 0 END)"),
            unique=True,
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True)
    start_date: date
    end_date: date | None = Field(default=None)
    snapshot_json: str | None = Field(default=None)
    color: str | None = Field(default=None)

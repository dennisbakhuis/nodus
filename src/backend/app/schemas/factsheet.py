import json
import uuid
from datetime import date, datetime

from pydantic import BaseModel, field_validator

from app.models.factsheet import TaxCreditCandidate
from app.schemas.assessment import AssessmentCreate


class PublicationLink(BaseModel):
    """A single publication link with an optional description."""

    url: str
    description: str | None = None


class FactsheetCreate(BaseModel):
    """Request schema for creating a new Factsheet version.

    An Assessment is created atomically in the same transaction as the Factsheet.
    The service layer is responsible for the transaction boundary.
    """

    summary: str = ""
    description: str = ""
    key_players: str = ""
    tax_credit_candidate: TaxCreditCandidate = TaxCreditCandidate.No
    recommended_next_steps: str = ""
    current_challenges: str = ""
    publication_links: list[PublicationLink] = []
    strategic_innovation_field_id: uuid.UUID | None = None
    last_updated: date = date.today()
    assessment: AssessmentCreate | None = None

    @field_validator("publication_links", mode="before")
    @classmethod
    def _coerce_publication_links(cls, v: object) -> object:
        if isinstance(v, list):
            out: list[object] = []
            for item in v:
                if isinstance(item, str):
                    out.append({"url": item, "description": None})
                else:
                    out.append(item)
            return out
        return v


class FactsheetRead(BaseModel):
    """Response schema for a Factsheet."""

    id: uuid.UUID
    technology_id: uuid.UUID
    version: int
    summary: str
    description: str
    key_players: str
    tax_credit_candidate: str
    recommended_next_steps: str
    current_challenges: str
    publication_links: list[PublicationLink] = []
    author_id: uuid.UUID | None = None
    strategic_innovation_field_id: uuid.UUID | None
    last_updated: date
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("publication_links", mode="before")
    @classmethod
    def _decode_publication_links(cls, v: object) -> object:
        """Decode the storage form (JSON string in DB) into a typed list.

        Existing rows store either ``"[]"`` (default), a JSON-encoded list of
        strings (legacy), or a JSON-encoded list of objects (current). All
        three shapes are accepted — list elements that come back as strings
        are coerced to ``{"url": ..., "description": None}`` for the same
        legacy compatibility we offer on the create path.
        """
        if isinstance(v, str):
            try:
                v = json.loads(v) if v else []
            except json.JSONDecodeError:
                return []
        if isinstance(v, list):
            out: list[object] = []
            for item in v:
                if isinstance(item, str):
                    out.append({"url": item, "description": None})
                else:
                    out.append(item)
            return out
        return v

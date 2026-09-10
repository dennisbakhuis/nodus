import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.assessment import (
    CollaborationPotential,
    ImpactPotential,
    ImplementationFeasibility,
    StrategicRelevance,
    TimeToMainstream,
)


TRL_MIN = 1
TRL_MAX = 9


class AssessmentCreate(BaseModel):
    """Request schema for creating an Assessment.

    ``trl`` is bounded to the standard 1-9 scale, so a value outside it is a 422
    rather than a row the UI cannot render. The table CHECK is wider only so
    rows imported against the IEA-extended range still load; nothing may write
    one.
    """

    strategic_relevance: StrategicRelevance | None = None
    strategic_relevance_notes: str | None = None
    impact_potential: ImpactPotential | None = None
    impact_potential_notes: str | None = None
    implementation_feasibility: ImplementationFeasibility | None = None
    implementation_feasibility_notes: str | None = None
    time_to_mainstream: TimeToMainstream | None = None
    time_to_mainstream_notes: str | None = None
    collaboration_potential: CollaborationPotential | None = None
    collaboration_potential_notes: str | None = None
    trl: int | None = Field(default=None, ge=TRL_MIN, le=TRL_MAX)
    trl_notes: str | None = None


class AssessmentRead(BaseModel):
    """Response schema for an Assessment."""

    id: uuid.UUID
    factsheet_id: uuid.UUID
    strategic_relevance: str | None
    strategic_relevance_notes: str | None
    impact_potential: str | None
    impact_potential_notes: str | None
    implementation_feasibility: str | None
    implementation_feasibility_notes: str | None
    time_to_mainstream: str | None
    time_to_mainstream_notes: str | None
    collaboration_potential: str | None
    collaboration_potential_notes: str | None
    trl: int | None
    trl_notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

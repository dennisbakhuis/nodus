"""Management endpoints for the Initiative resource.

Initiatives describe one concrete engagement of the host organisation with a
technology — each row carries a status and an optional contact person.
"""

import uuid

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.auth import OptionalUserDep, WriterDep, is_public_only
from app.db import SessionDep
from app.models.initiative import Initiative
from app.models.technology import Technology
from app.models.topic import Topic
from app.schemas.initiative import (
    InitiativeCreate,
    InitiativeRead,
    InitiativeUpdate,
)
from app.time_utils import now_utc

router = APIRouter(prefix="/manage", tags=["management-initiatives"])


def _load_technology(
    session: SessionDep,
    technology_id: uuid.UUID,
    user: OptionalUserDep,
) -> Technology:
    """Look up a Technology and enforce the same visibility rule as topic detail."""
    technology = session.get(Technology, technology_id)
    if technology is None:
        raise HTTPException(status_code=404, detail="Technology not found")
    topic = session.get(Topic, technology.topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Technology not found")
    if topic.not_for_external_publication and is_public_only(user):
        raise HTTPException(status_code=404, detail="Technology not found")
    return technology


@router.get(
    "/technologies/{technology_id}/initiatives",
    response_model=list[InitiativeRead],
)
def list_initiatives(
    technology_id: uuid.UUID,
    session: SessionDep,
    user: OptionalUserDep,
) -> list[InitiativeRead]:
    """List all initiatives for a Technology, ordered by display_order then created_at."""
    _load_technology(session, technology_id, user)
    rows = session.exec(
        select(Initiative)
        .where(Initiative.technology_id == technology_id)
        .order_by(Initiative.display_order, Initiative.created_at)  # type: ignore[arg-type]
    ).all()
    return [InitiativeRead.model_validate(r) for r in rows]


@router.post(
    "/technologies/{technology_id}/initiatives",
    response_model=InitiativeRead,
    status_code=201,
)
def create_initiative(
    technology_id: uuid.UUID,
    payload: InitiativeCreate,
    session: SessionDep,
    user: OptionalUserDep,
    _writer: WriterDep,
) -> InitiativeRead:
    """Create an Initiative for a Technology."""
    _load_technology(session, technology_id, user)
    initiative = Initiative(
        technology_id=technology_id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        contact_person_id=payload.contact_person_id,
        display_order=payload.display_order,
    )
    session.add(initiative)
    session.commit()
    session.refresh(initiative)
    return InitiativeRead.model_validate(initiative)


@router.patch(
    "/initiatives/{initiative_id}",
    response_model=InitiativeRead,
)
def update_initiative(
    initiative_id: uuid.UUID,
    payload: InitiativeUpdate,
    session: SessionDep,
    user: OptionalUserDep,
    _writer: WriterDep,
) -> InitiativeRead:
    """Update an Initiative — only provided fields are written."""
    initiative = session.get(Initiative, initiative_id)
    if initiative is None:
        raise HTTPException(status_code=404, detail="Initiative not found")
    _load_technology(session, initiative.technology_id, user)

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(initiative, key, value)
    initiative.updated_at = now_utc()

    session.add(initiative)
    session.commit()
    session.refresh(initiative)
    return InitiativeRead.model_validate(initiative)


@router.delete("/initiatives/{initiative_id}", status_code=204)
def delete_initiative(
    initiative_id: uuid.UUID,
    session: SessionDep,
    user: OptionalUserDep,
    _writer: WriterDep,
) -> None:
    """Delete an Initiative."""
    initiative = session.get(Initiative, initiative_id)
    if initiative is None:
        raise HTTPException(status_code=404, detail="Initiative not found")
    _load_technology(session, initiative.technology_id, user)
    session.delete(initiative)
    session.commit()

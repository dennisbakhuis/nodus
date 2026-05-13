import uuid

from fastapi import APIRouter, HTTPException

from app.auth import OptionalUserDep, is_public_only
from app.db import SessionDep
from app.schemas.movement_event import MovementEventRead
from app.services.movements import get_history

router = APIRouter(prefix="/technologies", tags=["movements"])


@router.get("/{technology_id}/movements", response_model=list[MovementEventRead])
def list_movements(
    technology_id: uuid.UUID,
    session: SessionDep,
    user: OptionalUserDep,
) -> list[MovementEventRead]:
    """Return the chronological movement history for a technology.

    For private topics (`not_for_external_publication=True`) anonymous callers
    receive a 404 — same code as a missing technology — so they cannot deduce
    a private topic's existence from this endpoint.
    """
    from app.models.technology import Technology
    from app.models.topic import Topic

    tech = session.get(Technology, technology_id)
    if tech is None:
        raise HTTPException(status_code=404, detail="Technology not found")

    if is_public_only(user):
        topic = session.get(Topic, tech.topic_id)
        if topic is None or topic.not_for_external_publication:
            raise HTTPException(status_code=404, detail="Technology not found")

    events = get_history(session, technology_id)
    return [MovementEventRead.model_validate(e) for e in events]

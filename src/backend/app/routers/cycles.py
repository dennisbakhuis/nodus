import json
import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.auth import AdminDep, OptionalUserDep, WriterDep, is_public_only
from app.db import SessionDep
from app.models.cycle import Cycle
from app.models.user import UserRole
from app.schemas.cycle import CycleCreate, CycleRead, CycleUpdate
from app.services.deliverables import (
    delta_document_markdown,
    detailed_report_markdown,
    radar_snapshot_json,
    summary_brief_markdown,
)

router = APIRouter(tags=["cycles"])


class CycleCloseRequest(BaseModel):
    """Optional fields when closing a cycle."""

    end_date: date | None = None


# ---------------------------------------------------------------------------
# Cycle CRUD
# ---------------------------------------------------------------------------


@router.get("/cycles", response_model=list[CycleRead])
def list_cycles(session: SessionDep) -> list[CycleRead]:
    """List all cycles ordered by start date descending."""
    cycles = session.exec(select(Cycle).order_by(Cycle.start_date.desc())).all()  # type: ignore[attr-defined]
    return [CycleRead.model_validate(c) for c in cycles]


@router.post("/cycles", response_model=CycleRead, status_code=201)
def create_cycle(body: CycleCreate, session: SessionDep, _user: WriterDep) -> CycleRead:
    """Create a new radar cycle.

    Parameters
    ----------
    body : CycleCreate
        Name and start_date for the new cycle.
    session : SessionDep
        Injected database session.

    Returns
    -------
    CycleRead
        Created cycle.

    Raises
    ------
    HTTPException
        409 if a cycle with this name already exists.
    """
    existing = session.exec(select(Cycle).where(Cycle.name == body.name)).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="A cycle with this name already exists")

    if body.end_date is None:
        other_open = session.exec(
            select(Cycle).where(Cycle.end_date == None)  # noqa: E711
        ).first()
        if other_open is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Another cycle is already open: '{other_open.name}'. "
                    "Close it before starting a new one."
                ),
            )

    cycle = Cycle(
        id=uuid.uuid4(),
        name=body.name,
        start_date=body.start_date,
        end_date=body.end_date,
        color=body.color,
    )
    session.add(cycle)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Another cycle is already open. Close it before starting a new one.",
        ) from exc
    session.refresh(cycle)
    return CycleRead.model_validate(cycle)


@router.patch("/cycles/{cycle_id}", response_model=CycleRead)
def update_cycle(
    cycle_id: uuid.UUID,
    body: CycleUpdate,
    session: SessionDep,
    user: WriterDep,
) -> CycleRead:
    """Partially update a cycle's name and/or color.

    Open cycles may be edited by Writers and Admins. Closed cycles are
    restricted to Admins because editing frozen metadata is closer to
    rewriting history than routine editing.
    """
    cycle = session.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="Cycle not found")

    if cycle.end_date is not None and user.role != UserRole.Admin.value:
        raise HTTPException(
            status_code=403,
            detail="Editing a closed cycle requires the Admin role",
        )

    if body.name is None and body.color is None:
        return CycleRead.model_validate(cycle)

    if body.name is not None and body.name != cycle.name:
        clash = session.exec(
            select(Cycle).where(Cycle.name == body.name).where(Cycle.id != cycle_id)
        ).first()
        if clash is not None:
            raise HTTPException(status_code=409, detail="A cycle with this name already exists")
        cycle.name = body.name

    if body.color is not None:
        cycle.color = body.color

    session.add(cycle)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="A cycle with this name already exists"
        ) from exc
    session.refresh(cycle)
    return CycleRead.model_validate(cycle)


@router.get("/cycles/{cycle_id}", response_model=CycleRead)
def get_cycle(cycle_id: uuid.UUID, session: SessionDep) -> CycleRead:
    """Return cycle metadata and snapshot.

    Parameters
    ----------
    cycle_id : uuid.UUID
        Cycle identifier.
    session : SessionDep
        Injected database session.

    Returns
    -------
    CycleRead
        Cycle with snapshot_data if closed.

    Raises
    ------
    HTTPException
        404 if not found.
    """
    cycle = session.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return CycleRead.model_validate(cycle)


@router.post("/cycles/{cycle_id}/close", response_model=CycleRead)
def close_cycle(
    cycle_id: uuid.UUID,
    body: CycleCloseRequest,
    session: SessionDep,
    _user: AdminDep,
) -> CycleRead:
    """Close a cycle: set end_date and freeze an On Radar snapshot.

    Parameters
    ----------
    cycle_id : uuid.UUID
        Cycle to close.
    body : CycleCloseRequest
        Optional explicit end_date; defaults to today.
    session : SessionDep
        Injected database session.

    Returns
    -------
    CycleRead
        Updated cycle with snapshot_data populated.

    Raises
    ------
    HTTPException
        404 if not found. 409 if already closed.
    """
    cycle = session.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="Cycle not found")
    if cycle.end_date is not None:
        raise HTTPException(status_code=409, detail="Cycle is already closed")

    cycle.end_date = body.end_date or date.today()

    # The frozen snapshot uses the same shape that the
    # /cycles/{id}/deliverables/radar.json endpoint serves, so historical
    # cycles can be replayed verbatim.
    snapshot = radar_snapshot_json(session, cycle.id)
    cycle.snapshot_json = json.dumps(snapshot)

    session.add(cycle)
    session.commit()
    session.refresh(cycle)
    return CycleRead.model_validate(cycle)


# ---------------------------------------------------------------------------
# Deliverable endpoints
# ---------------------------------------------------------------------------


@router.get("/cycles/{cycle_id}/deliverables/radar.json")
def deliverable_radar_json(
    cycle_id: uuid.UUID, session: SessionDep, user: OptionalUserDep
) -> dict[str, Any]:
    """Return the radar snapshot JSON for a closed cycle.

    Public-only callers (anonymous, PublicReader) get topics filtered to
    ``not_for_external_publication=False``.
    """
    cycle = session.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return radar_snapshot_json(session, cycle_id, public_only=is_public_only(user))


@router.get(
    "/cycles/{cycle_id}/deliverables/summary.md",
    response_class=PlainTextResponse,
    responses={200: {"content": {"text/plain": {}}}},
)
def deliverable_summary_md(cycle_id: uuid.UUID, session: SessionDep, user: OptionalUserDep) -> str:
    """Return the Summary Brief as Markdown."""
    cycle = session.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return summary_brief_markdown(session, cycle_id, public_only=is_public_only(user))


@router.get(
    "/cycles/{cycle_id}/deliverables/detailed.md",
    response_class=PlainTextResponse,
    responses={200: {"content": {"text/plain": {}}}},
)
def deliverable_detailed_md(cycle_id: uuid.UUID, session: SessionDep, user: OptionalUserDep) -> str:
    """Return the Detailed Report as Markdown."""
    cycle = session.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return detailed_report_markdown(session, cycle_id, public_only=is_public_only(user))


@router.get(
    "/cycles/{cycle_id}/deliverables/delta.md",
    response_class=PlainTextResponse,
    responses={200: {"content": {"text/plain": {}}}},
)
def deliverable_delta_md(cycle_id: uuid.UUID, session: SessionDep, user: OptionalUserDep) -> str:
    """Return the Delta Document as Markdown."""
    cycle = session.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return delta_document_markdown(session, cycle_id, public_only=is_public_only(user))


def _resolve_current_cycle(session: SessionDep) -> Cycle | None:
    """Return the latest open cycle, or the most recently closed cycle if none open."""
    open_cycle = session.exec(
        select(Cycle)
        .where(Cycle.end_date == None)  # noqa: E711
        .order_by(Cycle.start_date.desc())  # type: ignore[attr-defined]
    ).first()
    if open_cycle is not None:
        return open_cycle

    return session.exec(
        select(Cycle).order_by(Cycle.start_date.desc())  # type: ignore[attr-defined]
    ).first()

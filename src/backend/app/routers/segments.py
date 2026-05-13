"""Management endpoints for the Segment taxonomy (radar quadrants)."""

import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func
from sqlmodel import select

from app.auth import AdminDep
from app.db import SessionDep
from app.models.segment import Segment
from app.models.technology import Technology
from app.schemas.segment import (
    SegmentCreate,
    SegmentReadAdmin,
    SegmentReorderRequest,
    SegmentUpdate,
)

router = APIRouter(prefix="/segments", tags=["segments"])


def _usage_count(session: SessionDep, segment_id: uuid.UUID) -> int:
    """Count Technology rows whose current_segment_id points at this segment."""
    result = session.exec(
        select(func.count())
        .select_from(Technology)
        .where(Technology.current_segment_id == segment_id)
    ).one()
    if isinstance(result, tuple):
        return int(result[0])
    return int(result)


def _to_admin(segment: Segment, usage: int) -> SegmentReadAdmin:
    return SegmentReadAdmin(
        id=segment.id,
        name=segment.name,
        slug=segment.slug,
        display_order=segment.display_order,
        is_active=segment.is_active,
        theme_key=segment.theme_key,
        usage_count=usage,
    )


@router.get("", response_model=list[SegmentReadAdmin])
def list_segments(
    session: SessionDep,
    include_inactive: bool = Query(default=False),
) -> list[SegmentReadAdmin]:
    """List segments with usage counts.

    Parameters
    ----------
    session : SessionDep
        Database session.
    include_inactive : bool
        When True, also return segments where is_active is False.

    Returns
    -------
    list[SegmentReadAdmin]
        Segments ordered by display_order, with usage_count attached.
    """
    stmt = select(Segment)
    if not include_inactive:
        stmt = stmt.where(Segment.is_active == True)  # noqa: E712
    segments = session.exec(stmt).all()
    segments_sorted = sorted(segments, key=lambda s: s.display_order)
    return [_to_admin(s, _usage_count(session, s.id)) for s in segments_sorted]


@router.post("", response_model=SegmentReadAdmin, status_code=201)
def create_segment(
    payload: SegmentCreate,
    session: SessionDep,
    _user: AdminDep,
) -> SegmentReadAdmin:
    """Create a new segment.

    Parameters
    ----------
    payload : SegmentCreate
        Fields for the new segment.
    session : SessionDep
        Database session.

    Returns
    -------
    SegmentReadAdmin
        Created segment with usage_count = 0.

    Raises
    ------
    HTTPException
        409 when name or slug collides with an existing segment.
    """
    name_clash = session.exec(select(Segment).where(Segment.name == payload.name)).first()
    if name_clash is not None:
        raise HTTPException(status_code=409, detail="segment_name_taken")
    slug_clash = session.exec(select(Segment).where(Segment.slug == payload.slug)).first()
    if slug_clash is not None:
        raise HTTPException(status_code=409, detail="segment_slug_taken")

    if payload.display_order is None:
        max_order = session.exec(select(func.max(Segment.display_order))).one()
        if isinstance(max_order, tuple):
            max_order = max_order[0]
        next_order = (max_order or 0) + 1
    else:
        next_order = payload.display_order

    segment = Segment(
        name=payload.name,
        slug=payload.slug,
        display_order=next_order,
        is_active=payload.is_active,
        theme_key=payload.theme_key,
    )
    session.add(segment)
    session.commit()
    session.refresh(segment)
    return _to_admin(segment, 0)


@router.patch("/{segment_id}", response_model=SegmentReadAdmin)
def update_segment(
    segment_id: uuid.UUID,
    payload: SegmentUpdate,
    session: SessionDep,
    _user: AdminDep,
) -> SegmentReadAdmin:
    """Partially update a segment.

    Parameters
    ----------
    segment_id : uuid.UUID
        Segment identifier.
    payload : SegmentUpdate
        Fields to update.
    session : SessionDep
        Database session.

    Returns
    -------
    SegmentReadAdmin
        Updated segment.

    Raises
    ------
    HTTPException
        404 when no such segment.
        409 when renaming collides, or when deactivating an in-use segment.
    """
    segment = session.get(Segment, segment_id)
    if segment is None:
        raise HTTPException(status_code=404, detail="Segment not found")

    if payload.name is not None and payload.name != segment.name:
        clash = session.exec(
            select(Segment).where(Segment.name == payload.name, Segment.id != segment_id)
        ).first()
        if clash is not None:
            raise HTTPException(status_code=409, detail="segment_name_taken")
        segment.name = payload.name

    if payload.slug is not None and payload.slug != segment.slug:
        clash = session.exec(
            select(Segment).where(Segment.slug == payload.slug, Segment.id != segment_id)
        ).first()
        if clash is not None:
            raise HTTPException(status_code=409, detail="segment_slug_taken")
        segment.slug = payload.slug

    if payload.display_order is not None:
        segment.display_order = payload.display_order

    if payload.theme_key is not None:
        segment.theme_key = payload.theme_key

    if payload.is_active is not None and payload.is_active != segment.is_active:
        if payload.is_active is False:
            count = _usage_count(session, segment_id)
            if count > 0:
                raise HTTPException(
                    status_code=409,
                    detail={"reason": "segment_in_use", "usage_count": count},
                )
        segment.is_active = payload.is_active

    session.add(segment)
    session.commit()
    session.refresh(segment)
    return _to_admin(segment, _usage_count(session, segment_id))


@router.delete("/{segment_id}", status_code=204)
def delete_segment(segment_id: uuid.UUID, session: SessionDep, _user: AdminDep) -> None:
    """Hard-delete a segment.

    Parameters
    ----------
    segment_id : uuid.UUID
        Segment identifier.
    session : SessionDep
        Database session.

    Raises
    ------
    HTTPException
        404 when no such segment.
        409 when any Technology still references the segment.
    """
    segment = session.get(Segment, segment_id)
    if segment is None:
        raise HTTPException(status_code=404, detail="Segment not found")

    count = _usage_count(session, segment_id)
    if count > 0:
        raise HTTPException(
            status_code=409,
            detail={"reason": "segment_in_use", "usage_count": count},
        )

    session.delete(segment)
    session.commit()


@router.post("/reorder", response_model=list[SegmentReadAdmin])
def reorder_segments(
    payload: SegmentReorderRequest,
    session: SessionDep,
    _user: AdminDep,
) -> list[SegmentReadAdmin]:
    """Rewrite display_order to match the order of provided IDs.

    Parameters
    ----------
    payload : SegmentReorderRequest
        Desired ID order.
    session : SessionDep
        Database session.

    Returns
    -------
    list[SegmentReadAdmin]
        All segments in their new order.

    Raises
    ------
    HTTPException
        400 when IDs are duplicated or do not match the existing set.
    """
    if len(payload.ids) != len(set(payload.ids)):
        raise HTTPException(status_code=400, detail="duplicate_ids")

    existing = session.exec(select(Segment)).all()
    existing_ids = {s.id for s in existing}
    if set(payload.ids) != existing_ids:
        raise HTTPException(status_code=400, detail="ids_do_not_match_segments")

    by_id = {s.id: s for s in existing}
    for index, segment_id in enumerate(payload.ids, start=1):
        by_id[segment_id].display_order = index
        session.add(by_id[segment_id])
    session.commit()

    refreshed = sorted(session.exec(select(Segment)).all(), key=lambda s: s.display_order)
    return [_to_admin(s, _usage_count(session, s.id)) for s in refreshed]

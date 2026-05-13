"""Management endpoints for PeerReference and PeerReferenceUrl."""

import uuid

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.auth import OptionalUserDep, WriterDep, is_public_only
from app.db import SessionDep
from app.models.peer_reference import PeerReference, PeerReferenceUrl
from app.models.topic import Topic
from app.schemas.peer_reference import (
    PeerReferenceCreate,
    PeerReferenceRead,
    PeerReferenceUpdate,
    PeerReferenceUrlCreate,
    PeerReferenceUrlRead,
)
from app.services.peer_references import (
    add_url as add_peer_reference_url,
)
from app.services.peer_references import (
    list_urls_for_peer_reference as get_urls_for_peer_reference,
)
from app.services.peer_references import (
    upsert_by_topic_party as upsert_peer_reference,
)
from app.time_utils import now_utc

router = APIRouter(prefix="/manage/topics", tags=["management-peer-references"])


def _pr_to_read(pr: PeerReference, session: SessionDep) -> PeerReferenceRead:
    urls = get_urls_for_peer_reference(session, pr.id)
    from app.schemas.peer_reference import PeerReferenceUrlRead as PURLRead

    return PeerReferenceRead(
        id=pr.id,
        topic_id=pr.topic_id,
        party_id=pr.party_id,
        source_id=pr.source_id,
        peer_title=pr.peer_title,
        peer_ring_label=pr.peer_ring_label,
        peer_segment_label=pr.peer_segment_label,
        peer_time_to_mainstream_label=pr.peer_time_to_mainstream_label,
        summary=pr.summary,
        notes=pr.notes,
        last_imported_at=pr.last_imported_at,
        created_at=pr.created_at,
        updated_at=pr.updated_at,
        urls=[PURLRead.model_validate(u) for u in urls],
    )


@router.get("/{topic_id}/peer-references", response_model=list[PeerReferenceRead])
def list_peer_references(
    topic_id: uuid.UUID, session: SessionDep, user: OptionalUserDep
) -> list[PeerReferenceRead]:
    """List all PeerReferences for a Topic.

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    session : SessionDep
        Database session.

    Returns
    -------
    list[PeerReferenceRead]
        All peer references with their URLs.
    """
    topic = session.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    if topic.not_for_external_publication and is_public_only(user):
        raise HTTPException(status_code=404, detail="Topic not found")

    refs = session.exec(select(PeerReference).where(PeerReference.topic_id == topic_id)).all()
    return [_pr_to_read(pr, session) for pr in refs]


@router.post(
    "/{topic_id}/peer-references",
    response_model=PeerReferenceRead,
    status_code=201,
)
def create_peer_reference(
    topic_id: uuid.UUID,
    payload: PeerReferenceCreate,
    session: SessionDep,
    _user: WriterDep,
) -> PeerReferenceRead:
    """Create or update a PeerReference for a (Topic, Party) pair.

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    payload : PeerReferenceCreate
        Peer reference fields.
    session : SessionDep
        Database session.

    Returns
    -------
    PeerReferenceRead
        Upserted peer reference with URLs.
    """
    topic = session.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    pr = upsert_peer_reference(
        session=session,
        topic_id=topic_id,
        party_id=payload.party_id,
        payload={
            "peer_title": payload.peer_title,
            "peer_ring_label": payload.peer_ring_label,
            "peer_segment_label": payload.peer_segment_label,
            "peer_time_to_mainstream_label": payload.peer_time_to_mainstream_label,
            "summary": payload.summary,
            "notes": payload.notes,
            "source_id": payload.source_id,
        },
    )

    for url_payload in payload.urls:
        add_peer_reference_url(
            session=session,
            peer_reference_id=pr.id,
            url=url_payload.url,
            label=url_payload.label,
            display_order=url_payload.display_order,
        )

    session.refresh(pr)
    return _pr_to_read(pr, session)


@router.patch(
    "/{topic_id}/peer-references/{peer_ref_id}",
    response_model=PeerReferenceRead,
)
def update_peer_reference(
    topic_id: uuid.UUID,
    peer_ref_id: uuid.UUID,
    payload: PeerReferenceUpdate,
    session: SessionDep,
    _user: WriterDep,
) -> PeerReferenceRead:
    """Update mutable fields on a PeerReference.

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    peer_ref_id : uuid.UUID
        PeerReference identifier.
    payload : PeerReferenceUpdate
        Fields to update.
    session : SessionDep
        Database session.

    Returns
    -------
    PeerReferenceRead
        Updated peer reference.
    """
    pr = session.get(PeerReference, peer_ref_id)
    if pr is None or pr.topic_id != topic_id:
        raise HTTPException(status_code=404, detail="PeerReference not found")

    if payload.peer_title is not None:
        pr.peer_title = payload.peer_title
    if payload.peer_ring_label is not None:
        pr.peer_ring_label = payload.peer_ring_label
    if payload.peer_segment_label is not None:
        pr.peer_segment_label = payload.peer_segment_label
    if payload.peer_time_to_mainstream_label is not None:
        pr.peer_time_to_mainstream_label = payload.peer_time_to_mainstream_label
    if payload.summary is not None:
        pr.summary = payload.summary
    if payload.notes is not None:
        pr.notes = payload.notes
    pr.updated_at = now_utc()

    session.add(pr)
    session.commit()
    session.refresh(pr)
    return _pr_to_read(pr, session)


@router.delete("/{topic_id}/peer-references/{peer_ref_id}", status_code=204)
def delete_peer_reference(
    topic_id: uuid.UUID,
    peer_ref_id: uuid.UUID,
    session: SessionDep,
    _user: WriterDep,
) -> None:
    """Delete a PeerReference and cascade-delete its URLs.

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    peer_ref_id : uuid.UUID
        PeerReference identifier.
    session : SessionDep
        Database session.
    """
    pr = session.get(PeerReference, peer_ref_id)
    if pr is None or pr.topic_id != topic_id:
        raise HTTPException(status_code=404, detail="PeerReference not found")

    for url in session.exec(
        select(PeerReferenceUrl).where(PeerReferenceUrl.peer_reference_id == peer_ref_id)
    ).all():
        session.delete(url)

    session.delete(pr)
    session.commit()


@router.post(
    "/{topic_id}/peer-references/{peer_ref_id}/urls",
    response_model=PeerReferenceUrlRead,
    status_code=201,
)
def add_url_to_peer_reference(
    topic_id: uuid.UUID,
    peer_ref_id: uuid.UUID,
    payload: PeerReferenceUrlCreate,
    session: SessionDep,
    _user: WriterDep,
) -> PeerReferenceUrlRead:
    """Add a URL to a PeerReference.

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    peer_ref_id : uuid.UUID
        PeerReference identifier.
    payload : PeerReferenceUrlCreate
        URL fields.
    session : SessionDep
        Database session.

    Returns
    -------
    PeerReferenceUrlRead
        Created URL row.
    """
    pr = session.get(PeerReference, peer_ref_id)
    if pr is None or pr.topic_id != topic_id:
        raise HTTPException(status_code=404, detail="PeerReference not found")

    ref_url = add_peer_reference_url(
        session=session,
        peer_reference_id=peer_ref_id,
        url=payload.url,
        label=payload.label,
        display_order=payload.display_order,
    )
    return PeerReferenceUrlRead.model_validate(ref_url)


@router.delete(
    "/{topic_id}/peer-references/{peer_ref_id}/urls/{url_id}",
    status_code=204,
)
def remove_url_from_peer_reference(
    topic_id: uuid.UUID,
    peer_ref_id: uuid.UUID,
    url_id: uuid.UUID,
    session: SessionDep,
    _user: WriterDep,
) -> None:
    """Remove a URL from a PeerReference.

    Parameters
    ----------
    topic_id : uuid.UUID
        Topic identifier.
    peer_ref_id : uuid.UUID
        PeerReference identifier.
    url_id : uuid.UUID
        PeerReferenceUrl identifier.
    session : SessionDep
        Database session.
    """
    pr = session.get(PeerReference, peer_ref_id)
    if pr is None or pr.topic_id != topic_id:
        raise HTTPException(status_code=404, detail="PeerReference not found")
    ref_url = session.get(PeerReferenceUrl, url_id)
    if ref_url is None or ref_url.peer_reference_id != peer_ref_id:
        raise HTTPException(status_code=404, detail="URL not found")
    session.delete(ref_url)
    session.commit()

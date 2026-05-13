"""CRUD service for PeerReference and PeerReferenceUrl (§3.3a, §3.18, §6)."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from app.models.peer_reference import PeerReference, PeerReferenceUrl


def upsert_by_topic_party(
    session: Session,
    topic_id: uuid.UUID,
    party_id: uuid.UUID,
    payload: dict[str, Any],
) -> PeerReference:
    """Idempotent create-or-update for a PeerReference keyed on (topic_id, party_id).

    On first call: creates the PeerReference row.
    On subsequent calls: updates peer_title, peer_ring_label, peer_segment_label,
    peer_time_to_mainstream_label, summary, notes, and last_imported_at in place.

    Parameters
    ----------
    session : Session
        Active database session.
    topic_id : uuid.UUID
        ID of the owning Topic.
    party_id : uuid.UUID
        ID of the Party organisation.
    payload : dict[str, Any]
        Fields to set or update. Recognised keys: peer_title (required on create),
        peer_ring_label, peer_segment_label, peer_time_to_mainstream_label,
        summary, notes, source_id.

    Returns
    -------
    PeerReference
        The created or updated PeerReference row.
    """
    existing = session.exec(
        select(PeerReference)
        .where(PeerReference.topic_id == topic_id)
        .where(PeerReference.party_id == party_id)
    ).first()

    now = datetime.now(UTC)

    if existing is None:
        ref = PeerReference(
            id=uuid.uuid4(),
            topic_id=topic_id,
            party_id=party_id,
            peer_title=payload["peer_title"],
            peer_ring_label=payload.get("peer_ring_label"),
            peer_segment_label=payload.get("peer_segment_label"),
            peer_time_to_mainstream_label=payload.get("peer_time_to_mainstream_label"),
            summary=payload.get("summary"),
            notes=payload.get("notes"),
            source_id=payload.get("source_id"),
            last_imported_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(ref)
    else:
        existing.peer_title = payload.get("peer_title", existing.peer_title)
        existing.peer_ring_label = payload.get("peer_ring_label", existing.peer_ring_label)
        existing.peer_segment_label = payload.get("peer_segment_label", existing.peer_segment_label)
        existing.peer_time_to_mainstream_label = payload.get(
            "peer_time_to_mainstream_label", existing.peer_time_to_mainstream_label
        )
        existing.summary = payload.get("summary", existing.summary)
        existing.notes = payload.get("notes", existing.notes)
        if "source_id" in payload:
            existing.source_id = payload["source_id"]
        existing.last_imported_at = now
        existing.updated_at = now
        session.add(existing)
        ref = existing

    session.commit()
    session.refresh(ref)
    return ref


def get_peer_reference(session: Session, peer_reference_id: uuid.UUID) -> PeerReference | None:
    """Fetch a PeerReference by ID.

    Parameters
    ----------
    session : Session
        Active database session.
    peer_reference_id : uuid.UUID
        Primary key.

    Returns
    -------
    PeerReference | None
        The row, or None if not found.
    """
    return session.get(PeerReference, peer_reference_id)


def list_peer_references_for_topic(session: Session, topic_id: uuid.UUID) -> list[PeerReference]:
    """Return all PeerReference rows for a Topic.

    Parameters
    ----------
    session : Session
        Active database session.
    topic_id : uuid.UUID
        ID of the Topic.

    Returns
    -------
    list[PeerReference]
        All peer references for the topic.
    """
    return list(session.exec(select(PeerReference).where(PeerReference.topic_id == topic_id)).all())


def add_url(
    session: Session,
    peer_reference_id: uuid.UUID,
    url: str,
    label: str | None = None,
    display_order: int = 0,
) -> PeerReferenceUrl:
    """Add a URL to a PeerReference.

    Parameters
    ----------
    session : Session
        Active database session.
    peer_reference_id : uuid.UUID
        ID of the owning PeerReference.
    url : str
        The URL string.
    label : str | None
        Optional curator label.
    display_order : int
        Sort order; 0 is primary link.

    Returns
    -------
    PeerReferenceUrl
        The persisted URL row.

    Raises
    ------
    ValueError
        If the (peer_reference_id, url) pair already exists.
    """
    existing = session.exec(
        select(PeerReferenceUrl)
        .where(PeerReferenceUrl.peer_reference_id == peer_reference_id)
        .where(PeerReferenceUrl.url == url)
    ).first()
    if existing is not None:
        raise ValueError(f"URL {url!r} already exists for peer_reference={peer_reference_id}")
    pru = PeerReferenceUrl(
        id=uuid.uuid4(),
        peer_reference_id=peer_reference_id,
        url=url,
        label=label,
        display_order=display_order,
        created_at=datetime.now(UTC),
    )
    session.add(pru)
    session.commit()
    session.refresh(pru)
    return pru


def list_urls_for_peer_reference(
    session: Session, peer_reference_id: uuid.UUID
) -> list[PeerReferenceUrl]:
    """Return all PeerReferenceUrl rows for a PeerReference ordered by display_order.

    Parameters
    ----------
    session : Session
        Active database session.
    peer_reference_id : uuid.UUID
        ID of the owning PeerReference.

    Returns
    -------
    list[PeerReferenceUrl]
        URL rows ordered by display_order ascending.
    """
    return list(
        session.exec(
            select(PeerReferenceUrl)
            .where(PeerReferenceUrl.peer_reference_id == peer_reference_id)
            .order_by(PeerReferenceUrl.display_order)  # type: ignore[arg-type]
        ).all()
    )


def remove_url(session: Session, peer_reference_url_id: uuid.UUID) -> None:
    """Delete a PeerReferenceUrl by ID.

    Parameters
    ----------
    session : Session
        Active database session.
    peer_reference_url_id : uuid.UUID
        Primary key of the URL row to delete.

    Raises
    ------
    ValueError
        If no row exists with the given ID.
    """
    pru = session.get(PeerReferenceUrl, peer_reference_url_id)
    if pru is None:
        raise ValueError(f"PeerReferenceUrl {peer_reference_url_id} not found")
    session.delete(pru)
    session.commit()

import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.models.movement_event import MovementEvent


def record_event(
    session: Session,
    technology_id: uuid.UUID,
    event_type: str,
    from_value: str | None,
    to_value: str | None,
    rationale: str,
) -> MovementEvent:
    """Append a single immutable movement event to the log.

    Flushes the new row to the DB but does **not** commit — the caller owns
    the transaction so the event is part of one logical write with the
    handler that triggered it.

    Parameters
    ----------
    session : Session
        Active database session. The caller is expected to ``commit()`` or
        ``rollback()`` once the larger operation is complete.
    technology_id : uuid.UUID
        ID of the technology being changed.
    event_type : str
        One of the EventType enum values.
    from_value : str | None
        Previous state value; None for additions.
    to_value : str | None
        New state value; None for removals.
    rationale : str
        Required human-written explanation for the change.

    Returns
    -------
    MovementEvent
        The flushed (not yet committed) event row.
    """
    event = MovementEvent(
        id=uuid.uuid4(),
        technology_id=technology_id,
        event_type=event_type,
        from_value=from_value,
        to_value=to_value,
        rationale=rationale,
        timestamp=datetime.now(UTC),
    )
    session.add(event)
    session.flush()
    return event


def get_history(session: Session, technology_id: uuid.UUID) -> list[MovementEvent]:
    """Return the full movement history for a technology in chronological order.

    Parameters
    ----------
    session : Session
        Active database session.
    technology_id : uuid.UUID
        ID of the technology to query.

    Returns
    -------
    list[MovementEvent]
        All events sorted oldest-first.
    """
    statement = (
        select(MovementEvent)
        .where(MovementEvent.technology_id == technology_id)
        .order_by(MovementEvent.timestamp)  # type: ignore[arg-type]
    )
    return list(session.exec(statement).all())

"""Cycle-scoped ring-movement derivation per methodology §4.4.

The audit log (`MovementEvent.event_type`) records nine event types covering
every state change a curator makes — see `app.models.movement_event.EventType`.
The radar dot's movement indicator and the Delta Document deliverable, on the
other hand, talk about ring movement only: methodology §4.4 names five
categories — `Addition`, `Promotion`, `Demotion`, `Removal`, plus the implicit
"no change" when none of the four occur in the cycle.

This module is the single derivation surface that both `/radar/current` and
the cycle-deliverable path call. Audit-only event types (`StatusChanged`,
`Reactivated`, `RingChanged`, `SegmentChanged`, `FactsheetEdited`) collapse to
`NoChange` here — they remain visible in the audit timeline but do not
contribute to the cycle-level ring-movement summary.
"""

from __future__ import annotations

import enum
import uuid

from sqlmodel import Session, select

from app.models.movement_event import EventType, MovementEvent


class RingMovement(enum.StrEnum):
    """Methodology §4.4 ring-movement categories.

    The wire-format ``.value`` strings are lowercase singular nouns
    (``new`` / ``promoted`` / ``demoted`` / ``removed`` / ``unchanged``)
    matching the radar UI's existing dot-encoding contract. The methodology
    names (``Addition`` / ``Promotion`` / ``Demotion`` / ``Removal`` /
    ``NoChange``) live as Python identifiers so callers read with intent.
    """

    Addition = "new"
    Promotion = "promoted"
    Demotion = "demoted"
    Removal = "removed"
    NoChange = "unchanged"


# Ordered by precedence. If multiple ring-movement events occur in the same
# cycle, the **latest by timestamp** wins; this list is just the set of types
# that count as ring movements at all.
_RING_EVENT_TYPES: tuple[str, ...] = (
    str(EventType.Added),
    str(EventType.Promoted),
    str(EventType.Demoted),
    str(EventType.Removed),
)


_EVENT_TO_MOVEMENT: dict[str, RingMovement] = {
    str(EventType.Added): RingMovement.Addition,
    str(EventType.Promoted): RingMovement.Promotion,
    str(EventType.Demoted): RingMovement.Demotion,
    str(EventType.Removed): RingMovement.Removal,
}


def derive_ring_movement(
    session: Session,
    technology_id: uuid.UUID,
    cycle_id: uuid.UUID | None,
) -> RingMovement:
    """Return the ring-movement category for ``technology_id`` in ``cycle_id``.

    Looks at events of type Added / Promoted / Demoted / Removed scoped to
    the given cycle and returns the most recent one. Audit-only event types
    are ignored. Returns :py:class:`RingMovement.NoChange` when no qualifying
    event exists or when ``cycle_id`` is ``None`` (legacy rows that pre-date
    cycle scoping).

    Parameters
    ----------
    session
        Active database session.
    technology_id
        Technology whose movement is being derived.
    cycle_id
        Cycle to scope the query to. ``None`` short-circuits to ``NoChange``.

    Returns
    -------
    RingMovement
        One of the five methodology categories.
    """
    if cycle_id is None:
        return RingMovement.NoChange

    statement = (
        select(MovementEvent)
        .where(MovementEvent.technology_id == technology_id)
        .where(MovementEvent.cycle_id == cycle_id)
        .where(MovementEvent.event_type.in_(_RING_EVENT_TYPES))  # type: ignore[attr-defined]
        .order_by(MovementEvent.timestamp.desc())  # type: ignore[attr-defined]
        .limit(1)
    )
    latest = session.exec(statement).first()
    if latest is None:
        return RingMovement.NoChange
    return _EVENT_TO_MOVEMENT[latest.event_type]

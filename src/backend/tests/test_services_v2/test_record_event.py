"""Tests for `record_event`.

Locks the contract that ``record_event`` flushes but does NOT commit, so a
caller raising after recording an event rolls back both the prior staged
changes AND the freshly-recorded event atomically.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlmodel import Session, select

from app.models.movement_event import EventType, MovementEvent
from app.models.segment import Segment
from app.models.technology import RegistryStatus, Ring, Technology
from app.models.topic import Topic
from app.services.movements import record_event


def _make_topic_and_tech(session: Session) -> Technology:
    seg = session.exec(select(Segment)).first()
    if seg is None:
        seg = Segment(name="Test Segment", slug="test-segment", display_order=1)
        session.add(seg)
        session.flush()
    topic = Topic(canonical_name="Rollback Test", slug="rollback-test")
    session.add(topic)
    session.flush()
    tech = Technology(
        id=uuid.uuid4(),
        topic_id=topic.id,
        registry_status=str(RegistryStatus.OnRadar),
        current_ring=str(Ring.Pilot),
        current_segment_id=seg.id,
    )
    session.add(tech)
    session.flush()
    return tech


def test_record_event_persists_after_caller_commit(session: Session) -> None:
    """Happy path: caller commits, the event row is durable."""
    tech = _make_topic_and_tech(session)
    record_event(
        session=session,
        technology_id=tech.id,
        event_type=str(EventType.Promoted),
        from_value="Pilot",
        to_value="Invest",
        rationale="Pilot succeeded.",
    )
    session.commit()

    rows = session.exec(select(MovementEvent).where(MovementEvent.technology_id == tech.id)).all()
    assert len(rows) == 1
    assert rows[0].event_type == "Promoted"


def test_record_event_rolls_back_with_caller_raise(session: Session) -> None:
    """Caller raise → no event persisted, no earlier staged changes leaked."""
    tech = _make_topic_and_tech(session)
    session.commit()  # Tech is durable; rollback below should not affect it.

    # Stage an extra change to the tech that's about to be rolled back.
    tech.current_ring = str(Ring.Invest)
    session.add(tech)

    record_event(
        session=session,
        technology_id=tech.id,
        event_type=str(EventType.Promoted),
        from_value=str(Ring.Pilot),
        to_value=str(Ring.Invest),
        rationale="About to fail.",
    )
    # Simulate the kind of raise that used to cause partial-state bugs.
    with pytest.raises(RuntimeError):
        try:
            raise RuntimeError("Simulated downstream failure.")
        finally:
            session.rollback()

    # Both the event AND the unrelated tech mutation should be gone.
    events = session.exec(select(MovementEvent).where(MovementEvent.technology_id == tech.id)).all()
    assert events == []

    refreshed = session.exec(select(Technology).where(Technology.id == tech.id)).first()
    assert refreshed is not None
    assert refreshed.current_ring == str(Ring.Pilot)


def test_record_event_returns_flushed_row_with_id(session: Session) -> None:
    """The returned MovementEvent has its primary key populated post-flush."""
    tech = _make_topic_and_tech(session)
    event = record_event(
        session=session,
        technology_id=tech.id,
        event_type=str(EventType.Added),
        from_value=None,
        to_value=str(RegistryStatus.OnRadar),
        rationale="Initial placement.",
    )
    assert event.id is not None
    assert isinstance(event.timestamp, datetime)
    assert event.timestamp.tzinfo == UTC

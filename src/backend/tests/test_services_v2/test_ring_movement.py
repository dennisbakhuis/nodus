"""Tests for `derive_ring_movement`.

Locks the methodology contract: only the four ring-movement event types
contribute to the derived category; audit-only events collapse to NoChange;
multiple events in the same cycle resolve to the most recent one.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session

from app.models.cycle import Cycle
from app.models.movement_event import EventType, MovementEvent
from app.models.technology import RegistryStatus, Ring, Technology
from app.models.topic import Topic
from app.services.ring_movement import RingMovement, derive_ring_movement

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _make_topic(session: Session, name: str) -> Topic:
    topic = Topic(canonical_name=name, slug=_SLUG_RE.sub("-", name.lower()).strip("-"))
    session.add(topic)
    session.flush()
    return topic


def _ensure_segment(session: Session) -> uuid.UUID:
    """Return any segment id, creating one if the test session lacks them
    (the service-layer conftest does not run seed_segments)."""
    from sqlmodel import select

    from app.models.segment import Segment

    seg = session.exec(select(Segment)).first()
    if seg is None:
        seg = Segment(name="Test Segment", slug="test-segment", display_order=1)
        session.add(seg)
        session.flush()
    return seg.id


def _make_tech(session: Session, name: str) -> Technology:
    seg_id = _ensure_segment(session)
    topic = _make_topic(session, name)
    tech = Technology(
        id=uuid.uuid4(),
        topic_id=topic.id,
        registry_status=str(RegistryStatus.OnRadar),
        current_ring=str(Ring.Pilot),
        current_segment_id=seg_id,
    )
    session.add(tech)
    session.flush()
    return tech


def _make_cycle(
    session: Session,
    name: str = "2026-Q1",
    *,
    end_date: object | None = None,
) -> Cycle:
    cycle = Cycle(
        name=name,
        start_date=datetime.now(UTC).date(),
        end_date=end_date,  # type: ignore[arg-type]
    )
    session.add(cycle)
    session.flush()
    return cycle


def _record(
    session: Session,
    tech_id: uuid.UUID,
    cycle_id: uuid.UUID | None,
    event_type: str,
    *,
    offset_seconds: int = 0,
) -> MovementEvent:
    event = MovementEvent(
        id=uuid.uuid4(),
        technology_id=tech_id,
        cycle_id=cycle_id,
        event_type=event_type,
        rationale="Test event.",
        timestamp=datetime.now(UTC) + timedelta(seconds=offset_seconds),
    )
    session.add(event)
    session.flush()
    return event


def test_no_events_returns_no_change(session: Session) -> None:
    """A technology with no events in the cycle yields NoChange."""
    tech = _make_tech(session, "Quiet Tech")
    cycle = _make_cycle(session)
    assert derive_ring_movement(session, tech.id, cycle.id) is RingMovement.NoChange


def test_cycle_id_none_returns_no_change(session: Session) -> None:
    """Legacy rows without a cycle context yield NoChange (defensive)."""
    tech = _make_tech(session, "Legacy Tech")
    assert derive_ring_movement(session, tech.id, None) is RingMovement.NoChange


@pytest.mark.parametrize(
    "event_type,expected",
    [
        (str(EventType.Added), RingMovement.Addition),
        (str(EventType.Promoted), RingMovement.Promotion),
        (str(EventType.Demoted), RingMovement.Demotion),
        (str(EventType.Removed), RingMovement.Removal),
    ],
)
def test_single_ring_event_maps_to_methodology_category(
    session: Session, event_type: str, expected: RingMovement
) -> None:
    """Each ring-movement event type maps to its methodology category."""
    tech = _make_tech(session, f"{event_type} Tech")
    cycle = _make_cycle(session, f"Cycle for {event_type}")
    _record(session, tech.id, cycle.id, event_type)
    assert derive_ring_movement(session, tech.id, cycle.id) is expected


@pytest.mark.parametrize(
    "event_type",
    [
        str(EventType.StatusChanged),
        str(EventType.Reactivated),
        str(EventType.RingChanged),
        str(EventType.SegmentChanged),
        str(EventType.FactsheetEdited),
    ],
)
def test_audit_only_events_collapse_to_no_change(session: Session, event_type: str) -> None:
    """Audit-only event types do not surface as ring movements."""
    tech = _make_tech(session, f"{event_type} Tech")
    cycle = _make_cycle(session, f"Cycle for {event_type}")
    _record(session, tech.id, cycle.id, event_type)
    assert derive_ring_movement(session, tech.id, cycle.id) is RingMovement.NoChange


def test_latest_event_wins_within_cycle(session: Session) -> None:
    """When multiple ring events occur in the cycle, the most recent wins."""
    tech = _make_tech(session, "Busy Tech")
    cycle = _make_cycle(session)
    _record(session, tech.id, cycle.id, str(EventType.Added), offset_seconds=0)
    _record(session, tech.id, cycle.id, str(EventType.Promoted), offset_seconds=10)
    assert derive_ring_movement(session, tech.id, cycle.id) is RingMovement.Promotion


def test_audit_event_after_ring_event_does_not_overwrite(session: Session) -> None:
    """A later FactsheetEdited does not displace an earlier Promoted."""
    tech = _make_tech(session, "Edited Tech")
    cycle = _make_cycle(session)
    _record(session, tech.id, cycle.id, str(EventType.Promoted), offset_seconds=0)
    _record(session, tech.id, cycle.id, str(EventType.FactsheetEdited), offset_seconds=10)
    assert derive_ring_movement(session, tech.id, cycle.id) is RingMovement.Promotion


def test_other_cycle_events_are_ignored(session: Session) -> None:
    """Events scoped to a different cycle do not bleed into the queried cycle."""
    tech = _make_tech(session, "Cross-cycle Tech")
    cycle_a = _make_cycle(session, "Cycle A", end_date=datetime.now(UTC).date())
    cycle_b = _make_cycle(session, "Cycle B")
    _record(session, tech.id, cycle_a.id, str(EventType.Promoted))
    assert derive_ring_movement(session, tech.id, cycle_b.id) is RingMovement.NoChange


def test_wire_format_is_lowercase_singular(session: Session) -> None:
    """Frontend contract: ``.value`` strings are lowercase singular nouns
    matching the radar UI's existing dot-encoding (`new`, `promoted`,
    `demoted`, `removed`, `unchanged`)."""
    assert RingMovement.Addition.value == "new"
    assert RingMovement.Promotion.value == "promoted"
    assert RingMovement.Demotion.value == "demoted"
    assert RingMovement.Removal.value == "removed"
    assert RingMovement.NoChange.value == "unchanged"


def test_methodology_conformance_only_five_categories() -> None:
    """RingMovement has exactly the five categories in methodology §4.4."""
    assert {m.value for m in RingMovement} == {
        "new",
        "promoted",
        "demoted",
        "removed",
        "unchanged",
    }

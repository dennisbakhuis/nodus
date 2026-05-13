"""Tests for deliverables service — v2 Topic-grouped output."""

import uuid
from datetime import UTC, date, datetime

import pytest
from sqlmodel import Session

from app.models.cycle import Cycle
from app.models.factsheet import Factsheet
from app.models.movement_event import MovementEvent
from app.models.segment import Segment
from app.models.technology import RegistryStatus, Technology
from app.models.topic import Topic
from app.services.deliverables import (
    delta_document_markdown,
    detailed_report_markdown,
    radar_snapshot_json,
    summary_brief_markdown,
)


def _seed_segment(session: Session, name: str, slug: str, order: int) -> Segment:
    seg = Segment(id=uuid.uuid4(), name=name, slug=slug, display_order=order)
    session.add(seg)
    session.flush()
    return seg


def _seed_topic(session: Session, name: str, slug: str) -> Topic:
    topic = Topic(id=uuid.uuid4(), canonical_name=name, slug=slug)
    session.add(topic)
    session.flush()
    return topic


def _seed_technology(
    session: Session,
    topic: Topic,
    segment: Segment,
    ring: str = "Invest",
    status: str = RegistryStatus.OnRadar,
) -> Technology:
    tech = Technology(
        id=uuid.uuid4(),
        topic_id=topic.id,
        registry_status=status,
        current_segment_id=segment.id,
        current_ring=ring,
    )
    session.add(tech)
    session.flush()
    return tech


def _seed_factsheet(session: Session, technology: Technology) -> Factsheet:
    fs = Factsheet(
        id=uuid.uuid4(),
        technology_id=technology.id,
        version=1,
        summary="Test summary for the factsheet",
        description="Detailed description of the technology.",
        key_players="Key player A, Key player B.",
        recommended_next_steps="Proceed with pilot phase.",
        current_challenges="Integration complexity.",
        last_updated=date.today(),
    )
    session.add(fs)
    technology.current_factsheet_id = fs.id
    session.add(technology)
    session.flush()
    return fs


def _seed_cycle(session: Session, name: str = "2026-Q1") -> Cycle:
    cycle = Cycle(
        id=uuid.uuid4(),
        name=name,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 3, 31),
    )
    session.add(cycle)
    session.flush()
    return cycle


def _seed_movement_event(
    session: Session,
    technology: Technology,
    cycle: Cycle,
    event_type: str = "Added",
    rationale: str = "Initial placement.",
) -> MovementEvent:
    # Cycle association is now by timestamp range, so place the event inside the
    # cycle's window (start_date + 1 day, at midday UTC).
    inside_cycle = datetime.combine(cycle.start_date, datetime.min.time(), tzinfo=UTC).replace(
        hour=12
    )
    event = MovementEvent(
        id=uuid.uuid4(),
        technology_id=technology.id,
        event_type=event_type,
        from_value=None,
        to_value="Invest",
        rationale=rationale,
        timestamp=inside_cycle,
    )
    session.add(event)
    session.flush()
    return event


@pytest.fixture()
def populated_db(session: Session) -> dict[str, object]:
    seg = _seed_segment(session, "Digital & Data", "platforms", 1)
    topic = _seed_topic(session, "Digital Twins", "digital-twins")
    tech = _seed_technology(session, topic, seg)
    _seed_factsheet(session, tech)
    cycle = _seed_cycle(session)
    _seed_movement_event(session, tech, cycle)
    session.commit()
    return {"segment": seg, "topic": topic, "technology": tech, "cycle": cycle}


def test_radar_snapshot_json_non_empty(session: Session, populated_db: dict[str, object]) -> None:
    cycle = populated_db["cycle"]
    assert isinstance(cycle, Cycle)
    result = radar_snapshot_json(session, cycle.id)
    assert result["entries"]
    assert len(result["entries"]) == 1
    entry = result["entries"][0]
    assert entry["canonical_name"] == "Digital Twins"
    assert entry["ring"] == "Invest"


def test_radar_snapshot_json_has_v2_fields(
    session: Session, populated_db: dict[str, object]
) -> None:
    cycle = populated_db["cycle"]
    assert isinstance(cycle, Cycle)
    result = radar_snapshot_json(session, cycle.id)
    entry = result["entries"][0]
    assert "topic_id" in entry
    assert "technology_id" in entry
    assert "peer_reference_count" in entry
    assert "person_count" in entry


def test_radar_snapshot_json_has_segments_and_rings(
    session: Session, populated_db: dict[str, object]
) -> None:
    cycle = populated_db["cycle"]
    assert isinstance(cycle, Cycle)
    result = radar_snapshot_json(session, cycle.id)
    assert result["segments"]
    assert result["rings"]
    assert len(result["rings"]) == 4


def test_summary_brief_non_empty(session: Session, populated_db: dict[str, object]) -> None:
    cycle = populated_db["cycle"]
    assert isinstance(cycle, Cycle)
    md = summary_brief_markdown(session, cycle.id)
    assert md
    assert "Technology Radar" in md
    assert "2026-Q1" in md
    assert "Headline Changes" in md


def test_detailed_report_non_empty(session: Session, populated_db: dict[str, object]) -> None:
    cycle = populated_db["cycle"]
    assert isinstance(cycle, Cycle)
    md = detailed_report_markdown(session, cycle.id)
    assert md
    assert "Digital Twins" in md
    assert "On Radar" in md


def test_detailed_report_includes_factsheet_sections(
    session: Session, populated_db: dict[str, object]
) -> None:
    cycle = populated_db["cycle"]
    assert isinstance(cycle, Cycle)
    md = detailed_report_markdown(session, cycle.id)
    assert "Description" in md
    assert "Detailed description" in md


def test_delta_document_non_empty(session: Session, populated_db: dict[str, object]) -> None:
    cycle = populated_db["cycle"]
    assert isinstance(cycle, Cycle)
    md = delta_document_markdown(session, cycle.id)
    assert md
    assert "Delta Document" in md
    assert "Digital Twins" in md
    assert "Initial placement" in md


def test_delta_document_empty_cycle(session: Session) -> None:
    cycle = _seed_cycle(session, "2026-Q2")
    session.commit()
    md = delta_document_markdown(session, cycle.id)
    assert "No ring movements" in md


def test_delta_document_excludes_audit_only_events(session: Session) -> None:
    """Methodology §4.3: the Delta Document is ring-movement-only.

    Audit-only event types (FactsheetEdited, RingChanged, SegmentChanged,
    StatusChanged, Reactivated) must not appear; only Added / Promoted /
    Demoted / Removed do, and they render with methodology category
    labels (Addition / Promotion / Demotion / Removal) — not the raw
    audit-log event type names.
    """
    cycle = _seed_cycle(session, "2026-Q3")
    seg = _seed_segment(session, "Digital & Data", "platforms", 1)
    topic_a = _seed_topic(session, "Promoted Tech", "promoted-tech")
    topic_b = _seed_topic(session, "Audit-Only Tech", "audit-only-tech")
    tech_a = _seed_technology(session, topic_a, seg)
    tech_b = _seed_technology(session, topic_b, seg)

    inside = cycle.start_date
    inside_dt = datetime.combine(inside, datetime.min.time(), tzinfo=UTC)

    session.add(
        MovementEvent(
            id=uuid.uuid4(),
            technology_id=tech_a.id,
            cycle_id=cycle.id,
            event_type="Promoted",
            from_value="Pilot",
            to_value="Invest",
            rationale="Pilot succeeded.",
            timestamp=inside_dt,
        )
    )
    session.add(
        MovementEvent(
            id=uuid.uuid4(),
            technology_id=tech_b.id,
            cycle_id=cycle.id,
            event_type="FactsheetEdited",
            rationale="Curator updated copy.",
            timestamp=inside_dt,
        )
    )
    session.add(
        MovementEvent(
            id=uuid.uuid4(),
            technology_id=tech_b.id,
            cycle_id=cycle.id,
            event_type="RingChanged",
            from_value="Explore",
            to_value="Pilot",
            rationale="Routine reclassification.",
            timestamp=inside_dt,
        )
    )
    session.commit()

    md = delta_document_markdown(session, cycle.id)

    assert "Promoted Tech — Promotion" in md
    assert "Pilot succeeded." in md
    assert "**Ring movements:** 1" in md

    assert "Audit-Only Tech" not in md
    assert "FactsheetEdited" not in md
    assert "RingChanged" not in md
    # Heading style: methodology category, not audit-log raw name.
    assert "— Promoted" not in md


def test_summary_brief_includes_total_on_radar(
    session: Session, populated_db: dict[str, object]
) -> None:
    cycle = populated_db["cycle"]
    assert isinstance(cycle, Cycle)
    md = summary_brief_markdown(session, cycle.id)
    assert "Total On Radar:" in md

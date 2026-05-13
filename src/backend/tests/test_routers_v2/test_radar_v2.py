"""Radar endpoint tests — v2, including PII boundary enforcement."""

import re
import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.technology import RegistryStatus, Technology
from app.models.topic import Topic


def _make_cycle(client: TestClient, name: str = "2026-Q1") -> dict:
    resp = client.post("/api/cycles", json={"name": name, "start_date": "2026-01-01"})
    assert resp.status_code == 201
    return resp.json()


def _default_segment_id(session: Session) -> uuid.UUID:
    """Return any seeded segment's id — required for On-Radar tech rows under
    the segment-required CHECK constraint."""
    from app.models.segment import Segment

    seg = session.exec(select(Segment)).first()
    assert seg is not None, "session fixture should have seeded segments"
    return seg.id


def _make_on_radar_tech(
    session: Session, name: str, ring: str = "Explore"
) -> tuple[Topic, Technology]:
    slug_re = re.compile(r"[^a-z0-9]+")
    slug = slug_re.sub("-", name.lower()).strip("-")
    topic = Topic(canonical_name=name, slug=slug)
    session.add(topic)
    session.flush()
    tech = Technology(
        id=uuid.uuid4(),
        topic_id=topic.id,
        registry_status=str(RegistryStatus.OnRadar),
        current_ring=ring,
        current_segment_id=_default_segment_id(session),
    )
    session.add(tech)
    session.commit()
    session.refresh(topic)
    session.refresh(tech)
    return topic, tech


def test_radar_current_returns_200_with_cycle(client: TestClient) -> None:
    """GET /api/radar/current returns 200 when a cycle exists."""
    _make_cycle(client, "2026-Radar-V2")
    resp = client.get("/api/radar/current")
    assert resp.status_code == 200


def test_radar_current_no_cycle_returns_empty_shape(client: TestClient) -> None:
    """GET /api/radar/current returns an empty radar shape when no cycle exists.

    The frontend boots against this endpoint on first page load; for a fresh
    install that has not yet had a cycle created, returning 200 with an empty
    entries list lets the UI render its empty state instead of an error toast.
    """
    resp = client.get("/api/radar/current")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cycle"] is None
    assert data["radar"]["cycle"] is None
    assert data["entries"] == []
    assert isinstance(data["segments"], list)
    assert isinstance(data["rings"], list)


def test_radar_current_structure(client: TestClient, session: Session) -> None:
    """GET /api/radar/current returns expected top-level keys."""
    _make_cycle(client, "2026-Struct")
    _make_on_radar_tech(session, "Grid Forming Inverters", "Invest")

    resp = client.get("/api/radar/current")
    assert resp.status_code == 200
    data = resp.json()

    assert "radar" in data
    assert "entries" in data
    assert "segments" in data
    assert "rings" in data
    assert "cycle" in data
    assert data["radar"]["title"] == "Technology Radar"


def test_radar_current_entries_include_on_radar_only(client: TestClient, session: Session) -> None:
    """Only On Radar topics appear in entries; Backlog and Archive excluded."""
    _make_cycle(client, "2026-Filter")

    slug_re = re.compile(r"[^a-z0-9]+")

    on_radar_name = "On Radar Technology"
    slug = slug_re.sub("-", on_radar_name.lower()).strip("-")
    topic1 = Topic(canonical_name=on_radar_name, slug=slug)
    session.add(topic1)
    session.flush()
    tech1 = Technology(
        id=uuid.uuid4(),
        topic_id=topic1.id,
        registry_status=str(RegistryStatus.OnRadar),
        current_ring="Monitor",
        current_segment_id=_default_segment_id(session),
    )
    session.add(tech1)

    backlog_name = "Backlog Technology"
    slug2 = slug_re.sub("-", backlog_name.lower()).strip("-")
    topic2 = Topic(canonical_name=backlog_name, slug=slug2)
    session.add(topic2)
    session.flush()
    tech2 = Technology(
        id=uuid.uuid4(),
        topic_id=topic2.id,
        registry_status=str(RegistryStatus.Backlog),
    )
    session.add(tech2)
    session.commit()

    resp = client.get("/api/radar/current")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    names = [e["canonical_name"] for e in entries]
    assert "On Radar Technology" in names
    assert "Backlog Technology" not in names


def test_radar_excludes_not_for_external_publication(
    client: TestClient, anon_client: TestClient, session: Session
) -> None:
    """Private topics are hidden from anonymous callers but visible to authed users."""
    _make_cycle(client, "2026-Exclude")

    slug_re = re.compile(r"[^a-z0-9]+")
    private_name = "Private Technology"
    slug = slug_re.sub("-", private_name.lower()).strip("-")
    topic = Topic(
        canonical_name=private_name,
        slug=slug,
        not_for_external_publication=True,
    )
    session.add(topic)
    session.flush()
    tech = Technology(
        id=uuid.uuid4(),
        topic_id=topic.id,
        registry_status=str(RegistryStatus.OnRadar),
        current_ring="Explore",
        current_segment_id=_default_segment_id(session),
    )
    session.add(tech)
    session.commit()

    anon_resp = anon_client.get("/api/radar/current")
    anon_names = [e["canonical_name"] for e in anon_resp.json()["entries"]]
    assert private_name not in anon_names

    auth_resp = client.get("/api/radar/current")
    auth_names = [e["canonical_name"] for e in auth_resp.json()["entries"]]
    assert private_name in auth_names


def test_radar_current_filter_by_ring(client: TestClient, session: Session) -> None:
    """GET /api/radar/current?ring=Invest filters to Invest ring only."""
    _make_cycle(client, "2026-Ring")
    _make_on_radar_tech(session, "Invest Technology", "Invest")
    _make_on_radar_tech(session, "Monitor Technology", "Monitor")

    resp = client.get("/api/radar/current?ring=Invest")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    names = [e["canonical_name"] for e in entries]
    assert "Invest Technology" in names
    assert "Monitor Technology" not in names


def test_radar_current_pii_boundary_no_email(client: TestClient, session: Session) -> None:
    """PersonReadPublic schema must not expose email on radar/current endpoint."""
    _make_cycle(client, "2026-PII")
    topic, tech = _make_on_radar_tech(session, "PII Test Technology", "Explore")

    from app.models.person import Person
    from app.models.topic_person_link import PersonLinkRole, TopicPersonLink

    person = Person(
        id=uuid.uuid4(),
        full_name="Jane Private",
        company="Acme",
        email="jane.private@example.com",
        role="Engineer",
        notes="Confidential notes here.",
    )
    session.add(person)
    session.flush()

    link = TopicPersonLink(
        id=uuid.uuid4(),
        topic_id=topic.id,
        person_id=person.id,
        link_role=str(PersonLinkRole.Owner),
    )
    session.add(link)
    session.commit()

    resp = client.get("/api/radar/current")
    assert resp.status_code == 200

    full_response_text = resp.text
    assert "jane.private@example.com" not in full_response_text
    assert "Confidential notes here." not in full_response_text

    entries = resp.json()["entries"]
    pii_entry = next((e for e in entries if e["canonical_name"] == "PII Test Technology"), None)
    assert pii_entry is not None
    assert len(pii_entry["persons"]) == 1
    person_data = pii_entry["persons"][0]["person"]
    assert "email" not in person_data
    assert "notes" not in person_data
    assert person_data["full_name"] == "Jane Private"


# --------------------------------------------------------------------------
# Derived ring-movement on /radar/current entries
# --------------------------------------------------------------------------


_METHODOLOGY_MOVEMENT_VALUES = {"new", "promoted", "demoted", "removed", "unchanged"}


def test_radar_movement_field_uses_methodology_categories(
    client: TestClient, session: Session
) -> None:
    """Every entry's `movement` field is one of methodology §4.4's five values.

    Audit-only event types (FactsheetEdited, RingChanged, etc.) must not
    surface as movement values — they collapse to `unchanged`.
    """
    from app.models.movement_event import EventType, MovementEvent

    cycle_dict = _make_cycle(client, "2026-Movement-Conformance")
    cycle_id = uuid.UUID(cycle_dict["id"])

    _, tech_promoted = _make_on_radar_tech(session, "Promoted Tech", "Pilot")
    _, tech_audit_only = _make_on_radar_tech(session, "Audit-Only Tech", "Pilot")
    _, _tech_silent = _make_on_radar_tech(session, "Silent Tech", "Pilot")

    session.add(
        MovementEvent(
            id=uuid.uuid4(),
            technology_id=tech_promoted.id,
            cycle_id=cycle_id,
            event_type=str(EventType.Promoted),
            rationale="Successful pilot.",
        )
    )
    session.add(
        MovementEvent(
            id=uuid.uuid4(),
            technology_id=tech_audit_only.id,
            cycle_id=cycle_id,
            event_type=str(EventType.FactsheetEdited),
            rationale="Updated factsheet copy.",
        )
    )
    session.commit()

    resp = client.get("/api/radar/current")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    by_name = {e["canonical_name"]: e for e in entries}

    assert by_name["Promoted Tech"]["movement"] == "promoted"
    assert by_name["Audit-Only Tech"]["movement"] == "unchanged"
    assert by_name["Silent Tech"]["movement"] == "unchanged"

    movement_values = {e["movement"] for e in entries}
    assert movement_values <= _METHODOLOGY_MOVEMENT_VALUES, (
        f"radar entries returned non-methodology movement values: "
        f"{movement_values - _METHODOLOGY_MOVEMENT_VALUES}"
    )


# --------------------------------------------------------------------------
# Query count on /radar/current is constant in N
# --------------------------------------------------------------------------


def test_radar_current_query_count_does_not_scale_with_technology_count(
    client: TestClient, session: Session
) -> None:
    """Pre-fix the loop issued 5+ queries per Technology — doubling the row
    count roughly doubled the query count. Post-fix the per-tech work is
    batched into a fixed number of `WHERE id IN (...)` queries, so the count
    is bounded.

    We measure: build N=5 techs → snapshot query count; build N=15 techs →
    snapshot again; assert the increase is small (< 5 extra queries) and
    well below the per-tech delta (10 × 5 = 50 in the pre-fix world).
    """
    from sqlalchemy import event

    _make_cycle(client, "2026-Q1-NPlus1")

    def _seed_n(n: int, prefix: str) -> None:
        for i in range(n):
            _make_on_radar_tech(session, f"{prefix} N+1 Tech {i}", "Pilot")

    def _count_queries() -> int:
        from app.db import engine as app_engine

        counter = {"n": 0}

        def _on_execute(_conn, _cursor, _stmt, _params, _ctx, _executemany) -> None:
            counter["n"] += 1

        event.listen(app_engine, "before_cursor_execute", _on_execute)
        try:
            resp = client.get("/api/radar/current")
            assert resp.status_code == 200
        finally:
            event.remove(app_engine, "before_cursor_execute", _on_execute)
        return counter["n"]

    _seed_n(5, "Small")
    queries_small = _count_queries()

    _seed_n(10, "Big")  # +10 → total 15
    queries_big = _count_queries()

    growth = queries_big - queries_small
    assert growth < 5, (
        f"query count grew by {growth} when adding 10 technologies — N+1 "
        f"regression. Small={queries_small}, big={queries_big}"
    )

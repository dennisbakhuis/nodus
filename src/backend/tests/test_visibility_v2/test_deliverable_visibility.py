"""Visibility-filter tests for cycle-deliverable endpoints.

Anonymous / PublicReader callers see only public topics; authenticated
Reader/Writer/Admin callers see everything. The four endpoints below
honour the same visibility perimeter as ``/radar/current``.
"""

from __future__ import annotations

import re
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.cycle import Cycle
from app.models.movement_event import EventType, MovementEvent
from app.models.segment import Segment
from app.models.technology import RegistryStatus, Ring, Technology
from app.models.topic import Topic
from app.models.user import UserRole

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    return _SLUG_RE.sub("-", name.lower()).strip("-")


@pytest.fixture(name="seeded_cycle")
def seeded_cycle_fixture(session: Session) -> Cycle:
    """Cycle plus one public + one private On-Radar topic with a Promoted event each."""
    cycle = Cycle(name="2026-Deliverable-Visibility", start_date=date(2026, 1, 1))
    session.add(cycle)
    session.flush()

    seg = session.exec(select(Segment)).first()
    assert seg is not None

    public_topic = Topic(
        canonical_name="Public Deliverable Topic",
        slug=_slugify("Public Deliverable Topic"),
    )
    private_topic = Topic(
        canonical_name="Private Deliverable Topic",
        slug=_slugify("Private Deliverable Topic"),
        not_for_external_publication=True,
    )
    session.add(public_topic)
    session.add(private_topic)
    session.flush()

    public_tech = Technology(
        id=uuid.uuid4(),
        topic_id=public_topic.id,
        registry_status=str(RegistryStatus.OnRadar),
        current_ring=str(Ring.Pilot),
        current_segment_id=seg.id,
    )
    private_tech = Technology(
        id=uuid.uuid4(),
        topic_id=private_topic.id,
        registry_status=str(RegistryStatus.OnRadar),
        current_ring=str(Ring.Pilot),
        current_segment_id=seg.id,
    )
    session.add(public_tech)
    session.add(private_tech)
    session.flush()

    for tech in (public_tech, private_tech):
        session.add(
            MovementEvent(
                id=uuid.uuid4(),
                technology_id=tech.id,
                cycle_id=cycle.id,
                event_type=str(EventType.Promoted),
                from_value="Pilot",
                to_value="Invest",
                rationale="Test promotion.",
            )
        )
    session.commit()
    return cycle


def test_radar_json_excludes_private_for_anonymous(
    anon_client: TestClient, seeded_cycle: Cycle
) -> None:
    """`/deliverables/radar.json` hides private topics from anonymous callers."""
    resp = anon_client.get(f"/api/cycles/{seeded_cycle.id}/deliverables/radar.json")
    assert resp.status_code == 200
    body = resp.json()
    names = {entry["canonical_name"] for entry in body["entries"]}
    assert "Public Deliverable Topic" in names
    assert "Private Deliverable Topic" not in names


def test_radar_json_includes_private_for_admin(client: TestClient, seeded_cycle: Cycle) -> None:
    """Admin (the default `client` fixture) sees both public and private entries."""
    resp = client.get(f"/api/cycles/{seeded_cycle.id}/deliverables/radar.json")
    assert resp.status_code == 200
    names = {entry["canonical_name"] for entry in resp.json()["entries"]}
    assert "Public Deliverable Topic" in names
    assert "Private Deliverable Topic" in names


@pytest.mark.parametrize("endpoint", ["summary.md", "detailed.md", "delta.md"])
def test_markdown_deliverables_hide_private_for_anonymous(
    anon_client: TestClient, seeded_cycle: Cycle, endpoint: str
) -> None:
    """Private topic name and rationale never appear in the anonymous Markdown."""
    resp = anon_client.get(f"/api/cycles/{seeded_cycle.id}/deliverables/{endpoint}")
    assert resp.status_code == 200
    body = resp.text
    assert "Private Deliverable Topic" not in body


@pytest.mark.parametrize("endpoint", ["summary.md", "detailed.md", "delta.md"])
def test_markdown_deliverables_show_private_for_admin(
    client: TestClient, seeded_cycle: Cycle, endpoint: str
) -> None:
    """Admin sees private topics in every Markdown deliverable."""
    resp = client.get(f"/api/cycles/{seeded_cycle.id}/deliverables/{endpoint}")
    assert resp.status_code == 200
    body = resp.text
    assert "Private Deliverable Topic" in body


@pytest.mark.parametrize(
    "role,allowed",
    [
        (None, False),
        (UserRole.Reader, True),
        (UserRole.Writer, True),
        (UserRole.Admin, True),
    ],
)
def test_radar_json_role_matrix(
    anon_client: TestClient,
    role_headers: dict[UserRole, dict[str, str]],
    seeded_cycle: Cycle,
    role: UserRole | None,
    allowed: bool,
) -> None:
    """Cross-role check on /deliverables/radar.json."""
    headers = role_headers[role] if role is not None else {}
    resp = anon_client.get(
        f"/api/cycles/{seeded_cycle.id}/deliverables/radar.json", headers=headers
    )
    assert resp.status_code == 200
    names = {entry["canonical_name"] for entry in resp.json()["entries"]}
    assert "Public Deliverable Topic" in names
    assert ("Private Deliverable Topic" in names) is allowed

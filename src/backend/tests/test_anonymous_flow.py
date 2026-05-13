"""End-to-end smoke tests for the anonymous (logged-out) visitor flow.

The contract these tests pin down is documented in ``docs/auth.md``: an
anonymous request is functionally equivalent to a ``PublicReader``. It can:

- list cycles
- read ``/api/radar/current``
- open the public detail panel for any topic flagged public
- get a 404 (not 401) for a non-public topic, so the topic's existence is
  not leaked to anonymous visitors

It cannot:

- list ``/api/manage/persons`` (PII surface)
- mutate any topic or factsheet
- access admin-only endpoints (users, settings PUT, backup)

Field-by-field visibility stripping is covered separately in
``tests/test_visibility_v2/``. This file is the higher-level smoke check
that the anonymous = PublicReader contract holds at the router level.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.cycle import Cycle
from app.models.factsheet import Factsheet
from app.models.segment import Segment
from app.models.technology import RegistryStatus, Ring, Technology
from app.models.topic import Topic
from app.models.user import User, UserRole


def _make_topic(
    session: Session,
    creator_id: uuid.UUID,
    *,
    canonical_name: str,
    slug: str,
    not_for_external_publication: bool,
) -> Topic:
    """Insert a fully-wired Topic + Technology + Factsheet for radar visibility tests."""
    topic = Topic(
        canonical_name=canonical_name,
        slug=slug,
        not_for_external_publication=not_for_external_publication,
    )
    session.add(topic)
    session.flush()

    segment = session.exec(select(Segment)).first()
    assert segment is not None, "seed_segments must run before this fixture"

    technology = Technology(
        id=uuid.uuid4(),
        topic_id=topic.id,
        registry_status=str(RegistryStatus.OnRadar),
        current_ring=str(Ring.Pilot),
        current_segment_id=segment.id,
        created_by_id=creator_id,
    )
    session.add(technology)
    session.flush()

    factsheet = Factsheet(
        technology_id=technology.id,
        version=1,
        summary=f"{canonical_name} summary",
        description=f"{canonical_name} description",
    )
    session.add(factsheet)
    session.flush()

    technology.current_factsheet_id = factsheet.id
    session.add(technology)
    session.commit()
    return topic


@pytest.fixture(name="seeded_topics")
def seeded_topics_fixture(
    session: Session, make_user: Callable[..., tuple[User, str]]
) -> tuple[Topic, Topic]:
    """Seed a public topic and a non-public topic; return (public, private)."""
    session.add(Cycle(name="2026-Anon", start_date=date(2026, 1, 1)))
    session.commit()
    writer, _ = make_user(role=UserRole.Writer, username="anon_writer")
    public_topic = _make_topic(
        session,
        writer.id,
        canonical_name="Anon Public Tech",
        slug="anon-public-tech",
        not_for_external_publication=False,
    )
    private_topic = _make_topic(
        session,
        writer.id,
        canonical_name="Anon Private Tech",
        slug="anon-private-tech",
        not_for_external_publication=True,
    )
    return public_topic, private_topic


def test_anonymous_can_list_cycles(
    anon_client: TestClient, seeded_topics: tuple[Topic, Topic]
) -> None:
    """Cycle browsing must work without a token — the picker is part of the public surface."""
    response = anon_client.get("/api/cycles")
    assert response.status_code == 200, response.text
    assert isinstance(response.json(), list)


def test_anonymous_can_fetch_current_radar(
    anon_client: TestClient, seeded_topics: tuple[Topic, Topic]
) -> None:
    """`/api/radar/current` is the primary public-facing surface."""
    response = anon_client.get("/api/radar/current")
    assert response.status_code == 200, response.text
    body = response.json()
    assert "technologies" in body or "entries" in body or "rings" in body


def test_anonymous_radar_excludes_private_topics(
    anon_client: TestClient, seeded_topics: tuple[Topic, Topic]
) -> None:
    """A topic flagged not_for_external_publication must not appear for anonymous viewers."""
    response = anon_client.get("/api/radar/current")
    assert response.status_code == 200
    body = response.text
    assert "Anon Public Tech" in body
    assert "Anon Private Tech" not in body, (
        "Non-public topics must be filtered out for anonymous (PublicReader) viewers."
    )


def test_anonymous_can_fetch_public_topic_detail(
    anon_client: TestClient, seeded_topics: tuple[Topic, Topic]
) -> None:
    """Public topics are readable without auth; the response is PublicReader-stripped."""
    public_topic, _ = seeded_topics
    response = anon_client.get(f"/api/topics/{public_topic.slug}")
    assert response.status_code == 200, response.text
    body = response.json()
    # PublicReader-stripped fields default to absent / None / [].
    assert body.get("created_by") in (None, {})
    assert body.get("persons", []) == []
    assert body.get("recent_events", []) == []


def test_anonymous_gets_404_for_private_topic(
    anon_client: TestClient, seeded_topics: tuple[Topic, Topic]
) -> None:
    """Returning 404 (not 401/403) means we don't leak that the topic exists."""
    _, private_topic = seeded_topics
    response = anon_client.get(f"/api/topics/{private_topic.slug}")
    assert response.status_code == 404, response.text


def test_anonymous_cannot_list_persons(
    anon_client: TestClient, seeded_topics: tuple[Topic, Topic]
) -> None:
    """Persons expose PII (email); the endpoint is Writer-gated even for read."""
    response = anon_client.get("/api/manage/persons")
    assert response.status_code == 401


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("POST", "/api/topics", {"canonical_name": "Shouldn't work"}),
        ("POST", "/api/cycles", {"name": "Shouldn't work", "start_date": "2026-06-01"}),
        ("PUT", "/api/settings/radar.title", {"value": "Hacked"}),
    ],
)
def test_anonymous_cannot_mutate(
    anon_client: TestClient,
    seeded_topics: tuple[Topic, Topic],
    method: str,
    path: str,
    payload: dict[str, object],
) -> None:
    """Every mutating endpoint refuses anonymous callers with 401."""
    response = anon_client.request(method, path, json=payload)
    assert response.status_code == 401, (
        f"{method} {path} returned {response.status_code}: {response.text}"
    )

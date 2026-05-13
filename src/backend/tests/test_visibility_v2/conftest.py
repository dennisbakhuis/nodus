"""Shared fixtures for visibility-filter tests.

Builds a fully-populated topic touching every field path declared in
`app.services.visibility.DEFAULT_FIELD_ROLES`, plus a separate private topic
flagged `not_for_external_publication`. Tests then probe the `/topics/{slug}`
and `/radar/current` endpoints under each `UserRole` and assert the role-gated
fields are present or stripped per `DEFAULT_FIELD_ROLES`.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from datetime import date

import pytest
from sqlmodel import Session, select

from app.models.alias import Alias
from app.models.assessment import Assessment
from app.models.cycle import Cycle
from app.models.factsheet import Factsheet
from app.models.movement_event import EventType, MovementEvent
from app.models.party import Party
from app.models.peer_reference import PeerReference
from app.models.person import Person
from app.models.segment import Segment
from app.models.technology import RegistryStatus, Ring, Technology
from app.models.topic import Topic
from app.models.topic_person_link import PersonLinkRole, TopicPersonLink
from app.models.user import User, UserRole

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    return _SLUG_RE.sub("-", name.lower()).strip("-")


@pytest.fixture(name="public_topic_slug")
def public_topic_slug_fixture(session: Session, make_user: Callable[..., tuple[User, str]]) -> str:
    """Seed one fully-populated public topic and return its slug.

    Touches every field path in DEFAULT_FIELD_ROLES so visibility-stripping
    can be observed per role:
    - aliases, persons, peer_references, recent_events, created_by
    - factsheet.{tax_credit_candidate, publication_links, key_players,
      recommended_next_steps, current_challenges}
    - assessment
    """
    cycle = Cycle(name="2026-Visibility", start_date=date(2026, 1, 1))
    session.add(cycle)
    session.flush()

    creator, _ = make_user(role=UserRole.Writer, username="vis_creator")

    name = "Visibility Public Topic"
    topic = Topic(canonical_name=name, slug=_slugify(name))
    session.add(topic)
    session.flush()

    default_segment = session.exec(select(Segment)).first()
    assert default_segment is not None
    tech = Technology(
        id=uuid.uuid4(),
        topic_id=topic.id,
        registry_status=str(RegistryStatus.OnRadar),
        current_ring=str(Ring.Pilot),
        current_segment_id=default_segment.id,
        created_by_id=creator.id,
    )
    session.add(tech)
    session.flush()

    factsheet = Factsheet(
        technology_id=tech.id,
        version=1,
        summary="Public summary",
        description="Public description",
        key_players="Vendor X (internal-only)",
        tax_credit_candidate="Yes",
        publication_links="[]",
        recommended_next_steps="Run pilot in Q3",
        current_challenges="Cost model unclear (internal-only)",
    )
    session.add(factsheet)
    session.flush()
    tech.current_factsheet_id = factsheet.id
    session.add(tech)

    assessment = Assessment(
        factsheet_id=factsheet.id,
        trl=6,
        strategic_relevance="High",
        impact_potential="High",
        implementation_feasibility="Medium",
        time_to_mainstream="2-5 yr",
        collaboration_potential="High",
    )
    session.add(assessment)

    session.add(Alias(topic_id=topic.id, alias_name="VPT", alias_name_normalised="vpt"))

    person = Person(
        full_name="Jane Internal",
        company="Acme",
        email="jane.internal@example.com",
        role="Engineer",
        notes="Confidential notes (internal-only).",
    )
    session.add(person)
    session.flush()
    session.add(
        TopicPersonLink(
            id=uuid.uuid4(),
            topic_id=topic.id,
            person_id=person.id,
            link_role=str(PersonLinkRole.Owner),
        )
    )

    party = Party(name="Peer Co", slug="peer-co")
    session.add(party)
    session.flush()
    session.add(
        PeerReference(
            id=uuid.uuid4(),
            topic_id=topic.id,
            party_id=party.id,
            peer_title="Same tech at peer org",
            peer_ring_label="Adopt",
            peer_segment_label="Operations",
            summary="Peer note",
        )
    )

    session.add(
        MovementEvent(
            id=uuid.uuid4(),
            technology_id=tech.id,
            event_type=str(EventType.Promoted),
            from_value=str(Ring.Explore),
            to_value=str(Ring.Pilot),
            rationale="Successful PoC",
        )
    )

    session.commit()
    return topic.slug


@pytest.fixture(name="private_topic_slug")
def private_topic_slug_fixture(session: Session) -> str:
    """Seed one `not_for_external_publication=True` topic and return its slug."""
    name = "Visibility Private Topic"
    topic = Topic(
        canonical_name=name,
        slug=_slugify(name),
        not_for_external_publication=True,
    )
    session.add(topic)
    session.flush()
    default_segment = session.exec(select(Segment)).first()
    assert default_segment is not None
    session.add(
        Technology(
            id=uuid.uuid4(),
            topic_id=topic.id,
            registry_status=str(RegistryStatus.OnRadar),
            current_ring=str(Ring.Pilot),
            current_segment_id=default_segment.id,
        )
    )
    session.commit()
    return topic.slug


@pytest.fixture(name="role_headers")
def role_headers_fixture(
    make_user: Callable[..., tuple[User, str]],
    auth_header: Callable[[str], dict[str, str]],
) -> dict[UserRole, dict[str, str]]:
    """Pre-create one user per non-public role; return a role→Authorization map.

    PublicReader is intentionally absent — anonymous callers (no header) are
    treated as PublicReader by `app.auth.is_public_only`.
    """
    headers: dict[UserRole, dict[str, str]] = {}
    for role in (UserRole.Reader, UserRole.Writer, UserRole.Admin):
        _, token = make_user(role=role, username=f"vis_{role.value}")
        headers[role] = auth_header(token)
    return headers

"""Tests for persons service — Person and TopicPersonLink CRUD."""

import uuid

import pytest
from sqlmodel import Session

from app.models.topic import Topic
from app.models.topic_person_link import PersonLinkRole
from app.services.persons import (
    create_person,
    get_person,
    link_person_to_topic,
    list_links_for_topic,
    list_persons,
    unlink_person_from_topic,
    update_person,
)


def _make_topic(session: Session, name: str = "Test Topic") -> Topic:
    topic = Topic(id=uuid.uuid4(), canonical_name=name, slug=name.lower().replace(" ", "-"))
    session.add(topic)
    session.commit()
    return topic


def test_create_person(session: Session) -> None:
    person = create_person(session, full_name="Alice Smith", company="Acme")
    assert person.id is not None
    assert person.full_name == "Alice Smith"
    assert person.company == "Acme"
    assert person.email is None


def test_create_person_with_email(session: Session) -> None:
    person = create_person(
        session,
        full_name="Bob Jones",
        company="Peer Co",
        email="bob@peer.example.com",
        department="Innovation",
    )
    assert person.email == "bob@peer.example.com"
    assert person.department == "Innovation"


def test_get_person_returns_row(session: Session) -> None:
    person = create_person(session, full_name="Carol", company="Peer Research")
    fetched = get_person(session, person.id)
    assert fetched is not None
    assert fetched.id == person.id


def test_get_person_missing_returns_none(session: Session) -> None:
    result = get_person(session, uuid.uuid4())
    assert result is None


def test_list_persons_returns_all(session: Session) -> None:
    create_person(session, full_name="Dave", company="Peer Lab")
    create_person(session, full_name="Eve", company="Peer Org")
    persons = list_persons(session)
    names = [p.full_name for p in persons]
    assert "Dave" in names
    assert "Eve" in names


def test_update_person_fields(session: Session) -> None:
    person = create_person(session, full_name="Frank", company="OldCo")
    updated = update_person(session, person.id, company="NewCo", notes="Updated notes")
    assert updated.company == "NewCo"
    assert updated.notes == "Updated notes"
    assert updated.full_name == "Frank"


def test_update_person_missing_raises(session: Session) -> None:
    with pytest.raises(ValueError, match="not found"):
        update_person(session, uuid.uuid4(), full_name="Ghost")


def test_link_person_to_topic_round_trip(session: Session) -> None:
    topic = _make_topic(session, "Offshore Wind")
    person = create_person(session, full_name="Grace", company="Acme")
    link = link_person_to_topic(
        session, topic.id, person.id, PersonLinkRole.Owner, notes="Primary owner"
    )
    assert link.id is not None
    assert link.topic_id == topic.id
    assert link.person_id == person.id
    assert link.link_role == PersonLinkRole.Owner
    assert link.notes == "Primary owner"


def test_link_person_duplicate_raises(session: Session) -> None:
    topic = _make_topic(session, "Energy Storage")
    person = create_person(session, full_name="Hank", company="Acme")
    link_person_to_topic(session, topic.id, person.id, PersonLinkRole.Author)
    with pytest.raises(ValueError, match="already exists"):
        link_person_to_topic(session, topic.id, person.id, PersonLinkRole.Author)


def test_link_person_different_roles_allowed(session: Session) -> None:
    topic = _make_topic(session, "Smart Grid")
    person = create_person(session, full_name="Iris", company="Acme")
    link1 = link_person_to_topic(session, topic.id, person.id, PersonLinkRole.Owner)
    link2 = link_person_to_topic(session, topic.id, person.id, PersonLinkRole.SubjectMatterExpert)
    assert link1.id != link2.id


def test_unlink_person_from_topic(session: Session) -> None:
    topic = _make_topic(session, "Digital Twins")
    person = create_person(session, full_name="Jake", company="Acme")
    link_person_to_topic(session, topic.id, person.id, PersonLinkRole.Contact)
    unlink_person_from_topic(session, topic.id, person.id, PersonLinkRole.Contact)
    links = list_links_for_topic(session, topic.id)
    assert not any(
        lk.person_id == person.id and lk.link_role == PersonLinkRole.Contact for lk in links
    )


def test_unlink_missing_raises(session: Session) -> None:
    topic = _make_topic(session, "Fuel Cells")
    person = create_person(session, full_name="Kim", company="Acme")
    with pytest.raises(ValueError, match="No link found"):
        unlink_person_from_topic(session, topic.id, person.id, PersonLinkRole.ProjectLead)


def test_list_links_for_topic(session: Session) -> None:
    topic = _make_topic(session, "Battery Storage")
    person_a = create_person(session, full_name="Leo", company="Acme")
    person_b = create_person(session, full_name="Mia", company="Peer Co")
    link_person_to_topic(session, topic.id, person_a.id, PersonLinkRole.Owner)
    link_person_to_topic(session, topic.id, person_b.id, PersonLinkRole.Contact)
    links = list_links_for_topic(session, topic.id)
    assert len(links) == 2
    person_ids = {lk.person_id for lk in links}
    assert person_a.id in person_ids
    assert person_b.id in person_ids

"""Tests for peer_references service — upsert idempotency and URL management."""

import uuid

import pytest
from sqlmodel import Session

from app.models.party import Party
from app.models.topic import Topic
from app.services.peer_references import (
    add_url,
    get_peer_reference,
    list_peer_references_for_topic,
    list_urls_for_peer_reference,
    remove_url,
    upsert_by_topic_party,
)


def _make_topic(session: Session, name: str = "Test Topic") -> Topic:
    topic = Topic(id=uuid.uuid4(), canonical_name=name, slug=name.lower().replace(" ", "-"))
    session.add(topic)
    session.commit()
    return topic


def _make_party(session: Session, name: str = "Peer Co") -> Party:
    party = Party(id=uuid.uuid4(), name=name, slug=name.lower())
    session.add(party)
    session.commit()
    return party


def test_upsert_creates_on_first_call(session: Session) -> None:
    topic = _make_topic(session, "Grid-Forming Inverters")
    party = _make_party(session, "Peer Co")
    ref = upsert_by_topic_party(
        session,
        topic.id,
        party.id,
        {"peer_title": "Grid-Forming Technologies", "peer_ring_label": "Investeren"},
    )
    assert ref.id is not None
    assert ref.peer_title == "Grid-Forming Technologies"
    assert ref.peer_ring_label == "Investeren"


def test_upsert_idempotent_same_payload(session: Session) -> None:
    topic = _make_topic(session, "Quantum Computing")
    party = _make_party(session, "Peer Research")
    payload = {"peer_title": "Quantum Technologies", "summary": "Quantum overview"}
    ref1 = upsert_by_topic_party(session, topic.id, party.id, payload)
    ref2 = upsert_by_topic_party(session, topic.id, party.id, payload)
    assert ref1.id == ref2.id


def test_upsert_updates_on_second_call(session: Session) -> None:
    topic = _make_topic(session, "Digital Twins")
    party = _make_party(session, "Peer Org")
    upsert_by_topic_party(session, topic.id, party.id, {"peer_title": "Original Title"})
    updated = upsert_by_topic_party(
        session, topic.id, party.id, {"peer_title": "Updated Title", "summary": "New summary"}
    )
    assert updated.peer_title == "Updated Title"
    assert updated.summary == "New summary"


def test_upsert_only_one_row(session: Session) -> None:
    topic = _make_topic(session, "Energy Storage")
    party = _make_party(session, "Peer Consortium")
    payload = {"peer_title": "Storage Tech"}
    upsert_by_topic_party(session, topic.id, party.id, payload)
    upsert_by_topic_party(session, topic.id, party.id, payload)
    refs = list_peer_references_for_topic(session, topic.id)
    assert len(refs) == 1


def test_upsert_different_parties_separate_rows(session: Session) -> None:
    topic = _make_topic(session, "Hydrogen")
    party_a = _make_party(session, "PeerA2")
    party_b = _make_party(session, "PeerB2")
    upsert_by_topic_party(session, topic.id, party_a.id, {"peer_title": "Hydrogen A"})
    upsert_by_topic_party(session, topic.id, party_b.id, {"peer_title": "Hydrogen B"})
    refs = list_peer_references_for_topic(session, topic.id)
    assert len(refs) == 2


def test_get_peer_reference_returns_row(session: Session) -> None:
    topic = _make_topic(session, "Service Mesh")
    party = _make_party(session, "Peer Research Lab")
    ref = upsert_by_topic_party(session, topic.id, party.id, {"peer_title": "Service Mesh Systems"})
    fetched = get_peer_reference(session, ref.id)
    assert fetched is not None
    assert fetched.id == ref.id


def test_get_peer_reference_missing_returns_none(session: Session) -> None:
    result = get_peer_reference(session, uuid.uuid4())
    assert result is None


def test_add_url_creates_row(session: Session) -> None:
    topic = _make_topic(session, "Offshore Wind")
    party = _make_party(session, "WindParty")
    ref = upsert_by_topic_party(
        session, topic.id, party.id, {"peer_title": "Offshore Wind Concept"}
    )
    pru = add_url(
        session,
        ref.id,
        "https://example.com/card",
        label="card",
        display_order=0,
    )
    assert pru.id is not None
    assert pru.url == "https://example.com/card"
    assert pru.label == "card"


def test_add_url_duplicate_raises(session: Session) -> None:
    topic = _make_topic(session, "Fuel Cells")
    party = _make_party(session, "FuelParty")
    ref = upsert_by_topic_party(session, topic.id, party.id, {"peer_title": "Fuel Cells"})
    add_url(session, ref.id, "https://example.com/fc")
    with pytest.raises(ValueError, match="already exists"):
        add_url(session, ref.id, "https://example.com/fc")


def test_list_urls_ordered_by_display_order(session: Session) -> None:
    topic = _make_topic(session, "Smart Grid 2")
    party = _make_party(session, "GridParty")
    ref = upsert_by_topic_party(session, topic.id, party.id, {"peer_title": "Smart Grid"})
    add_url(session, ref.id, "https://example.com/secondary", display_order=1)
    add_url(session, ref.id, "https://example.com/primary", display_order=0)
    urls = list_urls_for_peer_reference(session, ref.id)
    assert urls[0].url == "https://example.com/primary"
    assert urls[1].url == "https://example.com/secondary"


def test_remove_url(session: Session) -> None:
    topic = _make_topic(session, "Battery Storage 2")
    party = _make_party(session, "BattParty")
    ref = upsert_by_topic_party(session, topic.id, party.id, {"peer_title": "Battery Storage"})
    pru = add_url(session, ref.id, "https://example.com/batt")
    remove_url(session, pru.id)
    urls = list_urls_for_peer_reference(session, ref.id)
    assert len(urls) == 0


def test_remove_url_missing_raises(session: Session) -> None:
    with pytest.raises(ValueError, match="not found"):
        remove_url(session, uuid.uuid4())

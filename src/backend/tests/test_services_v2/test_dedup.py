"""Tests for dedup service — Topic-anchored alias matching."""

import uuid

from sqlmodel import Session

from app.models.alias import Alias
from app.models.topic import Topic
from app.services.dedup import find_exact_alias_match, find_fuzzy_alias_matches
from app.services.normalize import normalize_alias


def _make_topic(session: Session, canonical_name: str, slug: str) -> Topic:
    topic = Topic(
        id=uuid.uuid4(),
        canonical_name=canonical_name,
        slug=slug,
    )
    session.add(topic)
    session.flush()
    return topic


def _make_alias(
    session: Session, topic: Topic, alias_name: str, source: str | None = None
) -> Alias:
    alias = Alias(
        id=uuid.uuid4(),
        topic_id=topic.id,
        alias_name=alias_name,
        alias_name_normalised=normalize_alias(alias_name),
        source=source,
    )
    session.add(alias)
    session.flush()
    return alias


def test_exact_match_returns_topic(session: Session) -> None:
    topic = _make_topic(session, "Digital Twins", "digital-twins")
    _make_alias(session, topic, "Digital Twin Technology")
    session.commit()

    result = find_exact_alias_match(session, "Digital Twin Technology")
    assert result is not None
    assert result.id == topic.id


def test_exact_match_case_insensitive(session: Session) -> None:
    topic = _make_topic(session, "Grid-Forming Inverters", "grid-forming-inverters")
    _make_alias(session, topic, "Grid Forming Inverters")
    session.commit()

    result = find_exact_alias_match(session, "GRID FORMING INVERTERS")
    assert result is not None
    assert result.id == topic.id


def test_exact_match_punctuation_stripped(session: Session) -> None:
    topic = _make_topic(session, "AI & ML", "ai-ml")
    _make_alias(session, topic, "AI/ML")
    session.commit()

    result = find_exact_alias_match(session, "ai, ml")
    assert result is not None
    assert result.id == topic.id


def test_exact_match_none_when_missing(session: Session) -> None:
    result = find_exact_alias_match(session, "Nonexistent Technology")
    assert result is None


def test_fuzzy_match_returns_close_candidates(session: Session) -> None:
    topic = _make_topic(session, "Quantum Computing", "quantum-computing")
    _make_alias(session, topic, "Quantum Computing")
    session.commit()

    results = find_fuzzy_alias_matches(session, "Quantum Computation", threshold=0.7)
    assert len(results) >= 1
    found_ids = [t.id for t, _ in results]
    assert topic.id in found_ids


def test_fuzzy_match_threshold_filters(session: Session) -> None:
    topic = _make_topic(session, "Blockchain", "blockchain")
    _make_alias(session, topic, "Blockchain Technology")
    session.commit()

    results = find_fuzzy_alias_matches(session, "Completely Different", threshold=0.99)
    assert len(results) == 0


def test_fuzzy_match_scores_in_range(session: Session) -> None:
    topic = _make_topic(session, "Digital Twins", "digital-twins-2")
    _make_alias(session, topic, "Digital Twins")
    session.commit()

    results = find_fuzzy_alias_matches(session, "Digital Twins", threshold=0.5)
    assert len(results) >= 1
    for _, score in results:
        assert 0.0 <= score <= 1.0


def test_fuzzy_match_deduplicates_per_topic(session: Session) -> None:
    topic = _make_topic(session, "Energy Storage", "energy-storage")
    _make_alias(session, topic, "Energy Storage Systems")
    _make_alias(session, topic, "Battery Energy Storage")
    session.commit()

    results = find_fuzzy_alias_matches(session, "Energy Storage", threshold=0.5)
    topic_ids = [t.id for t, _ in results]
    assert len(topic_ids) == len(set(topic_ids))


def test_multiple_parties_same_concept_single_topic(session: Session) -> None:
    topic = _make_topic(session, "Low Carbon Hydrogen", "low-carbon-hydrogen")
    _make_alias(session, topic, "Low Carbon Hydrogen", source="Peer Co")
    _make_alias(session, topic, "Green Hydrogen", source="Peer Research")
    session.commit()

    result_a = find_exact_alias_match(session, "Low Carbon Hydrogen")
    result_b = find_exact_alias_match(session, "Green Hydrogen")
    assert result_a is not None
    assert result_b is not None
    assert result_a.id == result_b.id == topic.id

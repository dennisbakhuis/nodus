"""Alias-based deduplication service operating over Topics (§5.5)."""

import uuid

from rapidfuzz import fuzz
from sqlmodel import Session, select

from app.models.alias import Alias
from app.models.topic import Topic
from app.services.normalize import normalize_alias


def _all_alias_topic_pairs(session: Session) -> list[tuple[Alias, Topic]]:
    stmt = select(Alias, Topic).where(Alias.topic_id == Topic.id)
    return list(session.exec(stmt).all())


def find_exact_alias_match(session: Session, name: str) -> Topic | None:
    """Return the Topic whose alias exactly matches `name` after normalisation.

    Searches across all Topics regardless of associated Technology registry status.

    Parameters
    ----------
    session : Session
        Active database session.
    name : str
        Proposed topic or alias name.

    Returns
    -------
    Topic | None
        Matched Topic, or None if no exact match exists.
    """
    normalised = normalize_alias(name)
    alias = session.exec(select(Alias).where(Alias.alias_name_normalised == normalised)).first()
    if alias is None:
        return None
    return session.get(Topic, alias.topic_id)


def find_fuzzy_alias_matches(
    session: Session,
    name: str,
    threshold: float = 0.85,
) -> list[tuple[Topic, float]]:
    """Return Topics whose aliases fuzzy-match `name` above `threshold`.

    Uses token_set_ratio from rapidfuzz to score each alias against the
    proposed name. Results are ranked by score descending.

    Parameters
    ----------
    session : Session
        Active database session.
    name : str
        Proposed topic name to match against.
    threshold : float
        Minimum similarity score (0–1) for a candidate to be included.

    Returns
    -------
    list[tuple[Topic, float]]
        Ranked list of (Topic, score) pairs above the threshold.
        Scores are normalised to [0, 1].
    """
    normalised = normalize_alias(name)
    pairs = _all_alias_topic_pairs(session)

    best: dict[uuid.UUID, tuple[Topic, float]] = {}
    for alias, topic in pairs:
        score = fuzz.token_set_ratio(normalised, normalize_alias(alias.alias_name)) / 100.0
        if score >= threshold:
            existing = best.get(topic.id)
            if existing is None or score > existing[1]:
                best[topic.id] = (topic, score)

    return sorted(best.values(), key=lambda x: x[1], reverse=True)

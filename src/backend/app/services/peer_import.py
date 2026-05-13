"""Orchestration for the peer-reference import endpoint.

The exported JSON from another Nodus instance is resolved into local
``Party`` + ``Source`` + ``Topic`` rows, then each topic's peer reference is
upserted via the existing ``upsert_by_topic_party`` service. ``dry_run`` mode
performs the resolution step but never mutates the database; it returns the
counts that a real run would produce.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from sqlmodel import Session, select

from app.models.party import Party
from app.models.peer_reference import PeerReference, PeerReferenceUrl
from app.models.source import Source
from app.models.topic import Topic
from app.schemas.peer_import import (
    ImportSummary,
    PeerImportPayload,
    PeerImportSource,
    PeerImportTopic,
    UnmatchedTopic,
)
from app.services.peer_references import upsert_by_topic_party
from app.time_utils import now_utc

EXPECTED_FORMAT = "nodus-peer-reference"
SUPPORTED_VERSIONS = {"1.0"}


def _slugify(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.lower())
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s or "party"


def validate_payload(payload: PeerImportPayload) -> None:
    """Reject payloads we cannot honour, with a clear 400-style error."""
    if payload.format != EXPECTED_FORMAT:
        raise ValueError(f"Unexpected format {payload.format!r}; expected {EXPECTED_FORMAT!r}")
    if payload.version not in SUPPORTED_VERSIONS:
        raise ValueError(
            f"Unsupported version {payload.version!r}; supported: {sorted(SUPPORTED_VERSIONS)}"
        )


def _find_party(session: Session, src: PeerImportSource) -> Party | None:
    if src.party_slug:
        existing = session.exec(select(Party).where(Party.slug == src.party_slug)).first()
        if existing is not None:
            return existing
    return session.exec(select(Party).where(Party.name == src.party_name)).first()


def _ensure_party(session: Session, src: PeerImportSource) -> tuple[Party, bool]:
    existing = _find_party(session, src)
    if existing is not None:
        return existing, False
    slug = src.party_slug or _slugify(src.party_name)
    base_slug = slug
    n = 2
    while session.exec(select(Party).where(Party.slug == slug)).first() is not None:
        slug = f"{base_slug}-{n}"
        n += 1
    party = Party(name=src.party_name.strip(), slug=slug, url=src.party_url)
    session.add(party)
    session.flush()
    return party, True


def _find_source(session: Session, party_id: uuid.UUID, source_name: str) -> Source | None:
    return session.exec(
        select(Source).where(Source.party_id == party_id).where(Source.source_name == source_name)
    ).first()


def _ensure_source(
    session: Session, party_id: uuid.UUID, src: PeerImportSource
) -> tuple[Source, bool]:
    existing = _find_source(session, party_id, src.source_name)
    if existing is not None:
        return existing, False
    source = Source(
        party_id=party_id,
        source_name=src.source_name,
        source_url=src.source_url,
        scraped_at=now_utc(),
        raw_json=json.dumps({"party_name": src.party_name, "party_slug": src.party_slug}),
    )
    session.add(source)
    session.flush()
    return source, True


def _match_topic(session: Session, t: PeerImportTopic) -> Topic | None:
    by_slug = session.exec(select(Topic).where(Topic.slug == t.slug)).first()
    if by_slug is not None:
        return by_slug
    candidates = session.exec(select(Topic)).all()
    needle = t.canonical_name.strip().lower()
    for candidate in candidates:
        if candidate.canonical_name.strip().lower() == needle:
            return candidate
    return None


def _existing_peer_ref(
    session: Session, topic_id: uuid.UUID, party_id: uuid.UUID
) -> PeerReference | None:
    return session.exec(
        select(PeerReference)
        .where(PeerReference.topic_id == topic_id)
        .where(PeerReference.party_id == party_id)
    ).first()


def _existing_url(
    session: Session, peer_reference_id: uuid.UUID, url: str
) -> PeerReferenceUrl | None:
    return session.exec(
        select(PeerReferenceUrl)
        .where(PeerReferenceUrl.peer_reference_id == peer_reference_id)
        .where(PeerReferenceUrl.url == url)
    ).first()


def preview_import(session: Session, payload: PeerImportPayload) -> ImportSummary:
    """Compute what an import would produce, without writing anything.

    Resolution reads existing rows only; party/source creation is *projected*
    via the ``would_create_*`` flags so the curator can see whether the
    importer will spawn fresh rows.
    """
    validate_payload(payload)

    party = _find_party(session, payload.source)
    party_created = party is None

    if party is not None:
        source = _find_source(session, party.id, payload.source.source_name)
        source_created = source is None
    else:
        source_created = True

    matched = 0
    unmatched: list[UnmatchedTopic] = []
    created = 0
    updated = 0
    urls_added = 0
    urls_skipped = 0

    for t in payload.topics:
        topic = _match_topic(session, t)
        if topic is None:
            unmatched.append(UnmatchedTopic(canonical_name=t.canonical_name, slug=t.slug))
            continue
        matched += 1
        if party is None:
            created += 1
            urls_added += len(t.urls)
            continue
        ref = _existing_peer_ref(session, topic.id, party.id)
        if ref is None:
            created += 1
            urls_added += len(t.urls)
        else:
            updated += 1
            for u in t.urls:
                if _existing_url(session, ref.id, u.url) is None:
                    urls_added += 1
                else:
                    urls_skipped += 1

    return ImportSummary(
        dry_run=True,
        party_resolved=payload.source.party_name,
        party_created=party_created,
        source_resolved=payload.source.source_name,
        source_created=source_created,
        topics_in_payload=len(payload.topics),
        topics_matched=matched,
        topics_unmatched=unmatched,
        peer_references_created=created,
        peer_references_updated=updated,
        urls_added=urls_added,
        urls_skipped=urls_skipped,
    )


def run_import(session: Session, payload: PeerImportPayload) -> ImportSummary:
    """Apply the import. Resolves Party + Source, upserts peer refs, syncs URLs."""
    validate_payload(payload)

    party, party_created = _ensure_party(session, payload.source)
    source, source_created = _ensure_source(session, party.id, payload.source)

    matched = 0
    unmatched: list[UnmatchedTopic] = []
    created = 0
    updated = 0
    urls_added = 0
    urls_skipped = 0

    for t in payload.topics:
        topic = _match_topic(session, t)
        if topic is None:
            unmatched.append(UnmatchedTopic(canonical_name=t.canonical_name, slug=t.slug))
            continue

        if topic.not_for_external_publication:
            unmatched.append(UnmatchedTopic(canonical_name=t.canonical_name, slug=t.slug))
            continue

        matched += 1
        existed = _existing_peer_ref(session, topic.id, party.id) is not None
        upsert_payload: dict[str, Any] = {
            "peer_title": t.peer_title,
            "peer_ring_label": t.peer_ring_label,
            "peer_segment_label": t.peer_segment_label,
            "peer_time_to_mainstream_label": t.peer_time_to_mainstream_label,
            "summary": t.summary,
            "source_id": source.id,
        }
        ref = upsert_by_topic_party(session, topic.id, party.id, upsert_payload)
        if existed:
            updated += 1
        else:
            created += 1

        for u in t.urls:
            if _existing_url(session, ref.id, u.url) is not None:
                urls_skipped += 1
                continue
            session.add(
                PeerReferenceUrl(
                    peer_reference_id=ref.id,
                    url=u.url,
                    label=u.label,
                    display_order=u.display_order,
                )
            )
            urls_added += 1
        session.commit()

    return ImportSummary(
        dry_run=False,
        party_resolved=party.name,
        party_created=party_created,
        source_resolved=source.source_name,
        source_created=source_created,
        topics_in_payload=len(payload.topics),
        topics_matched=matched,
        topics_unmatched=unmatched,
        peer_references_created=created,
        peer_references_updated=updated,
        urls_added=urls_added,
        urls_skipped=urls_skipped,
    )

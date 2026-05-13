"""Peer-reference import endpoint tests — v2.

Covers the round-trip (preview, commit, idempotent re-commit), unmatched
topics, dry-run isolation, version/format validation, and the
``not_for_external_publication`` smuggling guard.
"""

import re
import uuid
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.party import Party
from app.models.peer_reference import PeerReference, PeerReferenceUrl
from app.models.source import Source
from app.models.technology import RegistryStatus, Technology
from app.models.topic import Topic
from app.models.user import UserRole

ENDPOINT = "/api/manage/import/peer-references"
SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slug(name: str) -> str:
    return SLUG_RE.sub("-", name.lower()).strip("-")


def _seed_topic(session: Session, name: str, *, private: bool = False) -> Topic:
    topic = Topic(canonical_name=name, slug=_slug(name), not_for_external_publication=private)
    session.add(topic)
    session.flush()
    tech = Technology(
        id=uuid.uuid4(),
        topic_id=topic.id,
        registry_status=str(RegistryStatus.Backlog),
    )
    session.add(tech)
    session.commit()
    session.refresh(topic)
    return topic


def _payload(
    *,
    topics: list[dict],
    party_name: str = "Acme Energy",
    party_slug: str = "acme-energy",
    source_name: str = "acme-radar-2026",
    fmt: str = "nodus-peer-reference",
    version: str = "1.0",
) -> dict:
    return {
        "version": version,
        "format": fmt,
        "exported_at": "2026-05-11T00:00:00Z",
        "source": {
            "party_name": party_name,
            "party_slug": party_slug,
            "party_url": "https://acme.example/",
            "source_name": source_name,
            "source_url": "https://acme.example/radar",
        },
        "topics": topics,
    }


class TestImportRoundTrip:
    def test_commit_creates_party_source_and_peer_reference(
        self, client: TestClient, session: Session
    ) -> None:
        topic = _seed_topic(session, "Smart Grid Control")

        body = _payload(
            topics=[
                {
                    "canonical_name": topic.canonical_name,
                    "slug": topic.slug,
                    "peer_title": "Smart Grid in Acme Radar",
                    "peer_ring_label": "Pilot",
                    "peer_segment_label": "Grid Ops",
                    "peer_time_to_mainstream_label": "2-5 yr",
                    "summary": "Acme's framing of smart grid control",
                    "urls": [
                        {
                            "url": "https://acme.example/radar/smart-grid",
                            "label": "View",
                            "display_order": 0,
                        }
                    ],
                }
            ]
        )

        resp = client.post(ENDPOINT, json=body)
        assert resp.status_code == 200, resp.text
        summary = resp.json()
        assert summary["dry_run"] is False
        assert summary["party_created"] is True
        assert summary["source_created"] is True
        assert summary["topics_matched"] == 1
        assert summary["topics_unmatched"] == []
        assert summary["peer_references_created"] == 1
        assert summary["peer_references_updated"] == 0
        assert summary["urls_added"] == 1
        assert summary["urls_skipped"] == 0

        party = session.exec(select(Party).where(Party.slug == "acme-energy")).first()
        assert party is not None
        source = session.exec(select(Source).where(Source.party_id == party.id)).first()
        assert source is not None and source.source_name == "acme-radar-2026"
        ref = session.exec(select(PeerReference).where(PeerReference.topic_id == topic.id)).first()
        assert ref is not None
        assert ref.peer_title == "Smart Grid in Acme Radar"
        assert ref.source_id == source.id
        urls = session.exec(
            select(PeerReferenceUrl).where(PeerReferenceUrl.peer_reference_id == ref.id)
        ).all()
        assert [u.url for u in urls] == ["https://acme.example/radar/smart-grid"]

    def test_idempotent_replay_updates_in_place(self, client: TestClient, session: Session) -> None:
        topic = _seed_topic(session, "Quantum Sensors")
        body = _payload(
            topics=[
                {
                    "canonical_name": topic.canonical_name,
                    "slug": topic.slug,
                    "peer_title": "Quantum Sensors",
                    "peer_ring_label": "Explore",
                    "urls": [{"url": "https://acme.example/qs", "label": None, "display_order": 0}],
                }
            ]
        )
        first = client.post(ENDPOINT, json=body).json()
        assert first["peer_references_created"] == 1
        second = client.post(ENDPOINT, json=body).json()
        assert second["peer_references_created"] == 0
        assert second["peer_references_updated"] == 1
        assert second["urls_added"] == 0
        assert second["urls_skipped"] == 1
        assert second["party_created"] is False
        assert second["source_created"] is False

        refs = session.exec(select(PeerReference)).all()
        assert len(refs) == 1


class TestUnmatchedTopics:
    def test_topic_missing_locally_is_reported_not_created(
        self, client: TestClient, session: Session
    ) -> None:
        _seed_topic(session, "Existing Topic")
        body = _payload(
            topics=[
                {
                    "canonical_name": "Existing Topic",
                    "slug": "existing-topic",
                    "peer_title": "Match",
                },
                {
                    "canonical_name": "Phantom Topic",
                    "slug": "phantom-topic",
                    "peer_title": "Should be skipped",
                },
            ]
        )
        summary = client.post(ENDPOINT, json=body).json()
        assert summary["topics_matched"] == 1
        assert len(summary["topics_unmatched"]) == 1
        assert summary["topics_unmatched"][0]["slug"] == "phantom-topic"
        assert summary["peer_references_created"] == 1

        topics = session.exec(select(Topic).where(Topic.slug == "phantom-topic")).all()
        assert topics == []

    def test_canonical_name_fallback_match(self, client: TestClient, session: Session) -> None:
        topic = _seed_topic(session, "Demand Response")
        body = _payload(
            topics=[
                {
                    "canonical_name": "Demand Response",
                    "slug": "different-slug-here",
                    "peer_title": "DR",
                }
            ]
        )
        summary = client.post(ENDPOINT, json=body).json()
        assert summary["topics_matched"] == 1
        ref = session.exec(select(PeerReference).where(PeerReference.topic_id == topic.id)).first()
        assert ref is not None


class TestDryRun:
    def test_dry_run_leaves_db_untouched(self, client: TestClient, session: Session) -> None:
        topic = _seed_topic(session, "Battery Storage")
        body = _payload(
            topics=[
                {
                    "canonical_name": topic.canonical_name,
                    "slug": topic.slug,
                    "peer_title": "BESS",
                    "urls": [
                        {"url": "https://acme.example/bess", "label": None, "display_order": 0}
                    ],
                }
            ]
        )
        preview = client.post(f"{ENDPOINT}?dry_run=true", json=body).json()
        assert preview["dry_run"] is True
        assert preview["topics_matched"] == 1
        assert preview["peer_references_created"] == 1
        assert preview["urls_added"] == 1
        assert preview["party_created"] is True

        assert session.exec(select(Party)).all() == []
        assert session.exec(select(Source)).all() == []
        assert session.exec(select(PeerReference)).all() == []
        assert session.exec(select(PeerReferenceUrl)).all() == []

    def test_dry_run_matches_real_counts_for_update_path(
        self, client: TestClient, session: Session
    ) -> None:
        topic = _seed_topic(session, "Wind Forecasting")
        body = _payload(
            topics=[
                {
                    "canonical_name": topic.canonical_name,
                    "slug": topic.slug,
                    "peer_title": "WF",
                    "urls": [{"url": "https://acme.example/wf", "label": None, "display_order": 0}],
                }
            ]
        )
        client.post(ENDPOINT, json=body)
        preview = client.post(f"{ENDPOINT}?dry_run=true", json=body).json()
        assert preview["peer_references_created"] == 0
        assert preview["peer_references_updated"] == 1
        assert preview["urls_added"] == 0
        assert preview["urls_skipped"] == 1


class TestValidation:
    def test_wrong_format_rejected(self, client: TestClient, session: Session) -> None:
        body = _payload(topics=[], fmt="nodus-full")
        resp = client.post(ENDPOINT, json=body)
        assert resp.status_code == 400
        assert "format" in resp.json()["detail"]

    def test_unsupported_version_rejected(self, client: TestClient, session: Session) -> None:
        body = _payload(topics=[], version="9.9")
        resp = client.post(ENDPOINT, json=body)
        assert resp.status_code == 400

    def test_private_topic_is_not_imported(self, client: TestClient, session: Session) -> None:
        private = _seed_topic(session, "Internal Roadmap Item", private=True)
        body = _payload(
            topics=[
                {
                    "canonical_name": private.canonical_name,
                    "slug": private.slug,
                    "peer_title": "leaked",
                }
            ]
        )
        summary = client.post(ENDPOINT, json=body).json()
        assert summary["topics_matched"] == 0
        assert len(summary["topics_unmatched"]) == 1
        assert (
            session.exec(select(PeerReference).where(PeerReference.topic_id == private.id)).first()
            is None
        )


class TestAuthorization:
    def test_reader_forbidden(
        self,
        anon_client: TestClient,
        make_user: Callable[..., tuple[object, str]],
        auth_header: Callable[[str], dict[str, str]],
        session: Session,
    ) -> None:
        _, token = make_user(role=UserRole.Reader)
        body = _payload(topics=[])
        resp = anon_client.post(ENDPOINT, json=body, headers=auth_header(token))
        assert resp.status_code == 403

    def test_anonymous_unauthorized(self, anon_client: TestClient) -> None:
        resp = anon_client.post(ENDPOINT, json=_payload(topics=[]))
        assert resp.status_code == 401

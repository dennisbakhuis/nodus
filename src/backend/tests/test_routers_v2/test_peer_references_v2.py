"""PeerReference CRUD tests — v2."""

import re
import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.party import Party
from app.models.technology import RegistryStatus, Technology
from app.models.topic import Topic


def _create_topic(session: Session, name: str) -> Topic:
    slug_re = re.compile(r"[^a-z0-9]+")
    slug = slug_re.sub("-", name.lower()).strip("-")
    topic = Topic(canonical_name=name, slug=slug)
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


def _create_party(session: Session, name: str) -> Party:
    slug_re = re.compile(r"[^a-z0-9]+")
    slug = slug_re.sub("-", name.lower()).strip("-")
    party = Party(id=uuid.uuid4(), name=name, slug=slug)
    session.add(party)
    session.commit()
    session.refresh(party)
    return party


class TestPeerReferenceCRUD:
    def test_create_peer_reference(self, client: TestClient, session: Session) -> None:
        topic = _create_topic(session, "Smart Grid Control")
        party = _create_party(session, "Peer Reference Co")

        resp = client.post(
            f"/api/manage/topics/{topic.id}/peer-references",
            json={
                "party_id": str(party.id),
                "peer_title": "Smart Grid in Peer Radar",
                "peer_ring_label": "Adopt",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["peer_title"] == "Smart Grid in Peer Radar"
        assert data["party_id"] == str(party.id)

    def test_list_peer_references(self, client: TestClient, session: Session) -> None:
        topic = _create_topic(session, "Energy Forecasting")
        party = _create_party(session, "Peer Lister Co")

        client.post(
            f"/api/manage/topics/{topic.id}/peer-references",
            json={
                "party_id": str(party.id),
                "peer_title": "Forecasting entry",
            },
        )

        resp = client.get(f"/api/manage/topics/{topic.id}/peer-references")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_update_peer_reference(self, client: TestClient, session: Session) -> None:
        topic = _create_topic(session, "Power Electronics")
        party = _create_party(session, "Peer Update")

        create_resp = client.post(
            f"/api/manage/topics/{topic.id}/peer-references",
            json={"party_id": str(party.id), "peer_title": "Original title"},
        )
        pr_id = create_resp.json()["id"]

        resp = client.patch(
            f"/api/manage/topics/{topic.id}/peer-references/{pr_id}",
            json={"peer_title": "Updated title"},
        )
        assert resp.status_code == 200
        assert resp.json()["peer_title"] == "Updated title"

    def test_delete_peer_reference(self, client: TestClient, session: Session) -> None:
        topic = _create_topic(session, "Wind Integration")
        party = _create_party(session, "Peer Delete")

        create_resp = client.post(
            f"/api/manage/topics/{topic.id}/peer-references",
            json={"party_id": str(party.id), "peer_title": "To be deleted"},
        )
        pr_id = create_resp.json()["id"]

        del_resp = client.delete(f"/api/manage/topics/{topic.id}/peer-references/{pr_id}")
        assert del_resp.status_code == 204

        list_resp = client.get(f"/api/manage/topics/{topic.id}/peer-references")
        assert all(pr["id"] != pr_id for pr in list_resp.json())

    def test_delete_unknown_peer_reference_returns_404(
        self, client: TestClient, session: Session
    ) -> None:
        topic = _create_topic(session, "Asset Health")
        resp = client.delete(f"/api/manage/topics/{topic.id}/peer-references/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_topic_not_found_returns_404(self, client: TestClient, session: Session) -> None:
        party = _create_party(session, "Orphan Party")
        resp = client.post(
            f"/api/manage/topics/{uuid.uuid4()}/peer-references",
            json={"party_id": str(party.id), "peer_title": "Ghost entry"},
        )
        assert resp.status_code == 404


class TestPeerReferenceUrls:
    def test_add_url_to_peer_reference(self, client: TestClient, session: Session) -> None:
        topic = _create_topic(session, "Load Balancing")
        party = _create_party(session, "URL Party")

        pr_resp = client.post(
            f"/api/manage/topics/{topic.id}/peer-references",
            json={"party_id": str(party.id), "peer_title": "URL Test"},
        )
        pr_id = pr_resp.json()["id"]

        url_resp = client.post(
            f"/api/manage/topics/{topic.id}/peer-references/{pr_id}/urls",
            json={"url": "https://example.com/report", "label": "Full Report"},
        )
        assert url_resp.status_code == 201
        assert url_resp.json()["url"] == "https://example.com/report"

    def test_delete_url_from_peer_reference(self, client: TestClient, session: Session) -> None:
        topic = _create_topic(session, "Frequency Control")
        party = _create_party(session, "URL Del Party")

        pr_resp = client.post(
            f"/api/manage/topics/{topic.id}/peer-references",
            json={"party_id": str(party.id), "peer_title": "URL Del Test"},
        )
        pr_id = pr_resp.json()["id"]

        url_resp = client.post(
            f"/api/manage/topics/{topic.id}/peer-references/{pr_id}/urls",
            json={"url": "https://to-delete.example.com/"},
        )
        url_id = url_resp.json()["id"]

        del_resp = client.delete(
            f"/api/manage/topics/{topic.id}/peer-references/{pr_id}/urls/{url_id}"
        )
        assert del_resp.status_code == 204

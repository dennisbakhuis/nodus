"""Initiative CRUD tests."""

import re
import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.person import Person
from app.models.technology import RegistryStatus, Technology
from app.models.topic import Topic


def _create_topic_with_tech(session: Session, name: str) -> Technology:
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
    session.refresh(tech)
    return tech


def _create_person(session: Session, name: str) -> Person:
    person = Person(id=uuid.uuid4(), full_name=name, company="TestCo")
    session.add(person)
    session.commit()
    session.refresh(person)
    return person


class TestInitiativeCRUD:
    def test_create_initiative(self, client: TestClient, session: Session) -> None:
        tech = _create_topic_with_tech(session, "Energy Forecasting")
        contact = _create_person(session, "Alice Engineer")

        resp = client.post(
            f"/api/manage/technologies/{tech.id}/initiatives",
            json={
                "title": "Pilot with Peer Org",
                "description": "Joint pilot exploring forecasting.",
                "status": "Pilot",
                "contact_person_id": str(contact.id),
                "display_order": 1,
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["title"] == "Pilot with Peer Org"
        assert data["status"] == "Pilot"
        assert data["contact_person_id"] == str(contact.id)
        assert data["technology_id"] == str(tech.id)

    def test_list_initiatives_orders_by_display_order(
        self, client: TestClient, session: Session
    ) -> None:
        tech = _create_topic_with_tech(session, "Smart Sensors")
        for title, order in [("B", 1), ("A", 0), ("C", 2)]:
            client.post(
                f"/api/manage/technologies/{tech.id}/initiatives",
                json={"title": title, "display_order": order},
            )
        resp = client.get(f"/api/manage/technologies/{tech.id}/initiatives")
        assert resp.status_code == 200
        titles = [r["title"] for r in resp.json()]
        assert titles == ["A", "B", "C"]

    def test_update_initiative(self, client: TestClient, session: Session) -> None:
        tech = _create_topic_with_tech(session, "Quantum Sensing")
        created = client.post(
            f"/api/manage/technologies/{tech.id}/initiatives",
            json={"title": "Initial title", "status": "Idea"},
        ).json()

        resp = client.patch(
            f"/api/manage/initiatives/{created['id']}",
            json={"title": "Revised title", "status": "Scoping"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["title"] == "Revised title"
        assert data["status"] == "Scoping"

    def test_delete_initiative(self, client: TestClient, session: Session) -> None:
        tech = _create_topic_with_tech(session, "Floating Wind")
        created = client.post(
            f"/api/manage/technologies/{tech.id}/initiatives",
            json={"title": "Throwaway"},
        ).json()

        resp = client.delete(f"/api/manage/initiatives/{created['id']}")
        assert resp.status_code == 204

        listing = client.get(f"/api/manage/technologies/{tech.id}/initiatives")
        assert listing.json() == []

    def test_create_initiative_unknown_technology_404(
        self, client: TestClient, session: Session
    ) -> None:
        resp = client.post(
            f"/api/manage/technologies/{uuid.uuid4()}/initiatives",
            json={"title": "Orphan"},
        )
        assert resp.status_code == 404

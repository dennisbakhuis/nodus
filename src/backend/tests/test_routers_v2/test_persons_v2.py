"""Person CRUD and PII management surface tests — v2."""

import re
import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.technology import RegistryStatus, Technology
from app.models.topic import Topic


def _create_person(client: TestClient, name: str = "John Doe", email: str | None = None) -> dict:
    payload: dict = {"full_name": name, "company": "Acme"}
    if email is not None:
        payload["email"] = email
    resp = client.post("/api/manage/persons", json=payload)
    assert resp.status_code == 201
    return resp.json()


def _create_topic(session: Session, name: str) -> Topic:
    slug_re = re.compile(r"[^a-z0-9]+")
    slug = slug_re.sub("-", name.lower()).strip("-")
    topic = Topic(canonical_name=name, slug=slug)
    session.add(topic)
    tech = Technology(
        id=uuid.uuid4(),
        topic_id=None,  # type: ignore[arg-type]
        registry_status=str(RegistryStatus.Backlog),
    )
    session.add(topic)
    session.flush()
    tech.topic_id = topic.id
    session.add(tech)
    session.commit()
    session.refresh(topic)
    return topic


class TestPersonCRUD:
    def test_create_person_returns_management_view(self, client: TestClient) -> None:
        resp = client.post(
            "/api/manage/persons",
            json={
                "full_name": "Alice Smith",
                "company": "Acme",
                "email": "alice@example.com",
                "role": "Tech Lead",
                "notes": "Confidential info.",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["full_name"] == "Alice Smith"
        assert data["email"] == "alice@example.com"
        assert data["notes"] == "Confidential info."

    def test_list_persons(self, client: TestClient) -> None:
        _create_person(client, "Bob Jones")
        resp = client.get("/api/manage/persons")
        assert resp.status_code == 200
        names = [p["full_name"] for p in resp.json()]
        assert "Bob Jones" in names

    def test_get_person_by_id(self, client: TestClient) -> None:
        person = _create_person(client, "Carol White")
        resp = client.get(f"/api/manage/persons/{person['id']}")
        assert resp.status_code == 200
        assert resp.json()["full_name"] == "Carol White"

    def test_get_person_not_found(self, client: TestClient) -> None:
        resp = client.get(f"/api/manage/persons/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_update_person(self, client: TestClient) -> None:
        person = _create_person(client, "Dave Old", email="old@example.com")
        resp = client.patch(
            f"/api/manage/persons/{person['id']}",
            json={"full_name": "Dave New", "email": "new@example.com"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["full_name"] == "Dave New"
        assert data["email"] == "new@example.com"

    def test_management_view_includes_pii(self, client: TestClient) -> None:
        person = _create_person(client, "Eve Secret", email="eve@private.eu")
        resp = client.get(f"/api/manage/persons/{person['id']}")
        data = resp.json()
        assert "email" in data
        assert data["email"] == "eve@private.eu"
        assert "notes" in data


class TestTopicPersonLinks:
    def test_link_person_to_topic(self, client: TestClient, session: Session) -> None:
        person = _create_person(client, "Frank Link")
        topic = _create_topic(session, "Link Test Technology")

        resp = client.post(
            f"/api/manage/topics/{topic.id}/persons",
            json={"person_id": person["id"], "link_role": "Owner"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["link_role"] == "Owner"
        assert data["person"]["full_name"] == "Frank Link"

    def test_list_topic_persons(self, client: TestClient, session: Session) -> None:
        person = _create_person(client, "Grace Lister")
        topic = _create_topic(session, "List Persons Technology")

        client.post(
            f"/api/manage/topics/{topic.id}/persons",
            json={"person_id": person["id"], "link_role": "Author"},
        )

        resp = client.get(f"/api/manage/topics/{topic.id}/persons")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_duplicate_link_returns_409(self, client: TestClient, session: Session) -> None:
        person = _create_person(client, "Henry Dup")
        topic = _create_topic(session, "Dup Link Technology")

        client.post(
            f"/api/manage/topics/{topic.id}/persons",
            json={"person_id": person["id"], "link_role": "Contact"},
        )
        resp = client.post(
            f"/api/manage/topics/{topic.id}/persons",
            json={"person_id": person["id"], "link_role": "Contact"},
        )
        assert resp.status_code == 409

    def test_remove_topic_person_link(self, client: TestClient, session: Session) -> None:
        person = _create_person(client, "Iris Remove")
        topic = _create_topic(session, "Remove Link Technology")

        link_resp = client.post(
            f"/api/manage/topics/{topic.id}/persons",
            json={"person_id": person["id"], "link_role": "SubjectMatterExpert"},
        )
        link_id = link_resp.json()["id"]

        del_resp = client.delete(f"/api/manage/topics/{topic.id}/persons/{link_id}")
        assert del_resp.status_code == 204

    def test_management_link_includes_email(self, client: TestClient, session: Session) -> None:
        person = _create_person(client, "Jules PII", email="jules@example.com")
        topic = _create_topic(session, "PII Link Technology")

        client.post(
            f"/api/manage/topics/{topic.id}/persons",
            json={"person_id": person["id"], "link_role": "ProjectLead"},
        )

        resp = client.get(f"/api/manage/topics/{topic.id}/persons")
        assert resp.status_code == 200
        person_data = resp.json()[0]["person"]
        assert person_data["email"] == "jules@example.com"

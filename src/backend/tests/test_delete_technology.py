"""Permanent deletion of a Technology and everything it owns.

Archiving stays the normal retirement path; this endpoint is for rows that were
never a decision — importer artefacts that only pollute search and duplicate
detection. It is admin-only and refuses anything still On Radar.
"""

from fastapi.testclient import TestClient


def _make(client: TestClient, name: str) -> dict:
    """Create a topic with a technology and a factsheet, and return the ids."""
    created = client.post(
        "/api/topics", json={"canonical_name": name, "create_technology": True}
    ).json()
    tech_id = created["technology"]["id"]
    client.post(
        f"/api/technologies/{tech_id}/factsheet",
        json={"summary": "s", "assessment": {"trl": 5}},
    )
    return {"topic_id": created["topic"]["id"], "tech_id": tech_id, "slug": created["topic"]["slug"]}


def test_on_radar_technology_cannot_be_deleted(client: TestClient) -> None:
    """A live radar entry must be archived first, so nothing vanishes by accident."""
    made = _make(client, "Live Radar Entry")
    seg = client.get("/api/segments").json()[0]["id"]
    client.patch(
        f"/api/technologies/{made['tech_id']}",
        json={
            "registry_status": "On Radar",
            "current_ring": "Monitor",
            "current_segment_id": seg,
            "rationale": "on radar",
        },
    )
    resp = client.delete(f"/api/technologies/{made['tech_id']}")
    assert resp.status_code == 409
    assert client.get(f"/api/topics/{made['slug']}").status_code == 200


def test_delete_removes_technology_and_its_children(client: TestClient) -> None:
    """The factsheet, its assessment and the movement events go with it."""
    made = _make(client, "Importer Artefact")
    detail = client.get(f"/api/topics/{made['slug']}").json()
    assert detail["factsheet"] is not None

    resp = client.delete(f"/api/technologies/{made['tech_id']}")
    assert resp.status_code == 204

    after = client.get(f"/api/topics/{made['slug']}").json()
    assert after["technology"] is None
    assert after["factsheet"] is None
    assert client.get(f"/api/technologies/{made['tech_id']}/movements").status_code in (200, 404)


def test_delete_topic_too_removes_the_whole_entry(client: TestClient) -> None:
    """With delete_topic_too the entry disappears from the registry entirely."""
    made = _make(client, "Scraped Radar Page")
    resp = client.delete(f"/api/technologies/{made['tech_id']}?delete_topic_too=true")
    assert resp.status_code == 204
    assert client.get(f"/api/topics/{made['slug']}").status_code == 404


def test_delete_removes_relations_touching_the_topic(client: TestClient) -> None:
    """A dangling relation would outlive its endpoint, so both directions go."""
    doomed = _make(client, "Doomed Topic")
    keeper = _make(client, "Surviving Topic")
    client.post(
        "/api/relations",
        json={
            "from_topic_id": keeper["topic_id"],
            "to_topic_id": doomed["topic_id"],
            "relation_type": "relates_to",
        },
    )
    assert len(client.get("/api/relations").json()) >= 1

    client.delete(f"/api/technologies/{doomed['tech_id']}?delete_topic_too=true")

    remaining = client.get("/api/relations").json()
    assert all(
        doomed["topic_id"] not in (r["from_topic_id"], r["to_topic_id"]) for r in remaining
    )


def test_group_children_are_lifted_not_orphaned(client: TestClient) -> None:
    """Deleting a parent must not strand its children outside the tree."""
    parent = _make(client, "Doomed Parent")
    child = _make(client, "Child Of Doomed")
    client.patch(f"/api/topics/{child['topic_id']}", json={"parent_topic_id": parent["topic_id"]})

    client.delete(f"/api/technologies/{parent['tech_id']}?delete_topic_too=true")

    after = client.get(f"/api/topics/{child['slug']}").json()
    assert after["topic"]["parent_topic_id"] is None


def test_writer_cannot_delete(
    anon_client: TestClient,
    client: TestClient,
    make_user,
    auth_header,
) -> None:
    """Permanent deletion is admin-only; a writer may archive but not destroy."""
    from app.models.user import UserRole

    made = _make(client, "Writer Cannot Delete This")
    _, writer_token = make_user(role=UserRole.Writer)

    resp = anon_client.delete(
        f"/api/technologies/{made['tech_id']}", headers=auth_header(writer_token)
    )
    assert resp.status_code == 403
    assert client.get(f"/api/topics/{made['slug']}").json()["technology"] is not None

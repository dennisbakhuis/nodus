"""Segments CRUD router tests — v2."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.technology import RegistryStatus, Technology
from app.models.topic import Topic


def _make_topic_in_segment(session: Session, name: str, segment_id: uuid.UUID) -> Technology:
    slug = name.lower().replace(" ", "-")
    topic = Topic(canonical_name=name, slug=slug)
    session.add(topic)
    session.flush()
    tech = Technology(
        id=uuid.uuid4(),
        topic_id=topic.id,
        registry_status=str(RegistryStatus.OnRadar),
        current_ring="Explore",
        current_segment_id=segment_id,
    )
    session.add(tech)
    session.commit()
    session.refresh(tech)
    return tech


def _list_segments(client: TestClient, include_inactive: bool = False) -> list[dict]:
    suffix = "?include_inactive=true" if include_inactive else ""
    resp = client.get(f"/api/segments{suffix}")
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestListSegments:
    def test_list_returns_seeded_segments(self, client: TestClient) -> None:
        rows = _list_segments(client)
        slugs = [r["slug"] for r in rows]
        assert "engineering" in slugs
        assert len(rows) == 3

    def test_list_default_excludes_inactive(self, client: TestClient) -> None:
        rows = _list_segments(client)
        target = next(r for r in rows if r["slug"] == "data-ai")
        resp = client.patch(
            f"/api/segments/{target['id']}",
            json={"is_active": False},
        )
        assert resp.status_code == 200, resp.text
        rows_after = _list_segments(client)
        assert all(r["slug"] != "data-ai" for r in rows_after)

    def test_list_include_inactive(self, client: TestClient) -> None:
        rows = _list_segments(client)
        target = next(r for r in rows if r["slug"] == "platforms")
        client.patch(f"/api/segments/{target['id']}", json={"is_active": False})
        rows_all = _list_segments(client, include_inactive=True)
        slugs = [r["slug"] for r in rows_all]
        assert "platforms" in slugs

    def test_list_returns_usage_count_zero_initially(self, client: TestClient) -> None:
        rows = _list_segments(client)
        for r in rows:
            assert r["usage_count"] == 0

    def test_list_returns_usage_count_after_assignment(
        self, client: TestClient, session: Session
    ) -> None:
        rows = _list_segments(client)
        target = next(r for r in rows if r["slug"] == "platforms")
        _make_topic_in_segment(session, "Quantum Networks", uuid.UUID(target["id"]))
        rows_after = _list_segments(client)
        target_after = next(r for r in rows_after if r["slug"] == "platforms")
        assert target_after["usage_count"] == 1

    def test_list_includes_theme_key(self, client: TestClient) -> None:
        rows = _list_segments(client)
        for r in rows:
            assert isinstance(r["theme_key"], str)
            assert len(r["theme_key"]) > 0

    def test_list_sorted_by_display_order(self, client: TestClient) -> None:
        rows = _list_segments(client)
        orders = [r["display_order"] for r in rows]
        assert orders == sorted(orders)


class TestCreateSegment:
    def test_create_appends_to_end(self, client: TestClient) -> None:
        resp = client.post(
            "/api/segments",
            json={
                "name": "Cybersecurity",
                "slug": "cybersecurity",
                "theme_key": "rose",
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["name"] == "Cybersecurity"
        assert body["theme_key"] == "rose"
        assert body["is_active"] is True
        assert body["usage_count"] == 0
        assert body["display_order"] == 4

    def test_create_with_explicit_display_order(self, client: TestClient) -> None:
        resp = client.post(
            "/api/segments",
            json={
                "name": "Hydrogen",
                "slug": "hydrogen",
                "theme_key": "teal",
                "display_order": 99,
            },
        )
        assert resp.status_code == 201
        assert resp.json()["display_order"] == 99

    def test_create_duplicate_name_returns_409(self, client: TestClient) -> None:
        resp = client.post(
            "/api/segments",
            json={
                "name": "Platforms",
                "slug": "platforms-2",
                "theme_key": "violet",
            },
        )
        assert resp.status_code == 409

    def test_create_duplicate_slug_returns_409(self, client: TestClient) -> None:
        resp = client.post(
            "/api/segments",
            json={
                "name": "Other Digital",
                "slug": "platforms",
                "theme_key": "violet",
            },
        )
        assert resp.status_code == 409


class TestUpdateSegment:
    def test_update_renames(self, client: TestClient) -> None:
        rows = _list_segments(client)
        target = next(r for r in rows if r["slug"] == "data-ai")
        resp = client.patch(
            f"/api/segments/{target['id']}",
            json={"name": "Operations & Control"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Operations & Control"

    def test_update_theme_key(self, client: TestClient) -> None:
        rows = _list_segments(client)
        target = rows[0]
        resp = client.patch(
            f"/api/segments/{target['id']}",
            json={"theme_key": "amber"},
        )
        assert resp.status_code == 200
        assert resp.json()["theme_key"] == "amber"

    def test_update_rename_to_existing_returns_409(self, client: TestClient) -> None:
        rows = _list_segments(client)
        target = next(r for r in rows if r["slug"] == "data-ai")
        resp = client.patch(
            f"/api/segments/{target['id']}",
            json={"name": "Platforms"},
        )
        assert resp.status_code == 409

    def test_update_unknown_returns_404(self, client: TestClient) -> None:
        resp = client.patch(
            f"/api/segments/{uuid.uuid4()}",
            json={"name": "Anything"},
        )
        assert resp.status_code == 404

    def test_deactivate_unused_segment_succeeds(self, client: TestClient) -> None:
        rows = _list_segments(client)
        target = rows[0]
        assert target["usage_count"] == 0
        resp = client.patch(
            f"/api/segments/{target['id']}",
            json={"is_active": False},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    def test_deactivate_in_use_segment_blocked(self, client: TestClient, session: Session) -> None:
        rows = _list_segments(client)
        target = next(r for r in rows if r["slug"] == "platforms")
        _make_topic_in_segment(session, "Edge Computing", uuid.UUID(target["id"]))

        resp = client.patch(
            f"/api/segments/{target['id']}",
            json={"is_active": False},
        )
        assert resp.status_code == 409
        body = resp.json()
        assert body["detail"]["reason"] == "segment_in_use"
        assert body["detail"]["usage_count"] == 1

    def test_reactivate_segment(self, client: TestClient) -> None:
        rows = _list_segments(client)
        target = rows[0]
        client.patch(f"/api/segments/{target['id']}", json={"is_active": False})
        resp = client.patch(
            f"/api/segments/{target['id']}",
            json={"is_active": True},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True


class TestDeleteSegment:
    def test_delete_unused_succeeds(self, client: TestClient) -> None:
        resp = client.post(
            "/api/segments",
            json={"name": "Temporary", "slug": "temporary", "theme_key": "slate"},
        )
        seg_id = resp.json()["id"]
        resp = client.delete(f"/api/segments/{seg_id}")
        assert resp.status_code == 204

        rows = _list_segments(client, include_inactive=True)
        assert all(r["id"] != seg_id for r in rows)

    def test_delete_in_use_blocked(self, client: TestClient, session: Session) -> None:
        rows = _list_segments(client)
        target = next(r for r in rows if r["slug"] == "platforms")
        _make_topic_in_segment(session, "Smart Meters", uuid.UUID(target["id"]))

        resp = client.delete(f"/api/segments/{target['id']}")
        assert resp.status_code == 409
        body = resp.json()
        assert body["detail"]["reason"] == "segment_in_use"
        assert body["detail"]["usage_count"] == 1

    def test_delete_unknown_returns_404(self, client: TestClient) -> None:
        resp = client.delete(f"/api/segments/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestReorderSegments:
    def test_reorder_rewrites_display_order(self, client: TestClient) -> None:
        rows = _list_segments(client)
        reversed_ids = [r["id"] for r in reversed(rows)]
        resp = client.post("/api/segments/reorder", json={"ids": reversed_ids})
        assert resp.status_code == 200, resp.text

        rows_after = _list_segments(client)
        assert [r["id"] for r in rows_after] == reversed_ids
        assert [r["display_order"] for r in rows_after] == [1, 2, 3]

    def test_reorder_with_duplicate_ids_returns_400(self, client: TestClient) -> None:
        rows = _list_segments(client)
        ids = [rows[0]["id"], rows[0]["id"], rows[1]["id"]]
        resp = client.post("/api/segments/reorder", json={"ids": ids})
        assert resp.status_code == 400

    def test_reorder_with_missing_ids_returns_400(self, client: TestClient) -> None:
        rows = _list_segments(client)
        ids = [r["id"] for r in rows[:-1]]
        resp = client.post("/api/segments/reorder", json={"ids": ids})
        assert resp.status_code == 400


class TestRadarFiltersInactiveSegments:
    def test_radar_segments_excludes_inactive(self, client: TestClient, session: Session) -> None:
        client.post("/api/cycles", json={"name": "2026-Q-T", "start_date": "2026-01-01"})

        rows = _list_segments(client)
        target = rows[0]
        client.patch(f"/api/segments/{target['id']}", json={"is_active": False})

        resp = client.get("/api/radar/current")
        assert resp.status_code == 200
        radar_segments = resp.json()["segments"]
        assert all(r["id"] != target["id"] for r in radar_segments)

    def test_radar_segments_include_theme_key(self, client: TestClient, session: Session) -> None:
        client.post("/api/cycles", json={"name": "2026-Q-Theme", "start_date": "2026-01-01"})
        resp = client.get("/api/radar/current")
        assert resp.status_code == 200
        for seg in resp.json()["segments"]:
            assert "theme_key" in seg

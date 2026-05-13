"""Topic registry endpoint happy paths — v2."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.alias import Alias


def _create_topic(client: TestClient, name: str, force: bool = True) -> dict:
    resp = client.post("/api/topics", json={"canonical_name": name, "force_create": force})
    assert resp.status_code == 201
    return resp.json()["topic"]


class TestTopicList:
    def test_empty_returns_list(self, client: TestClient) -> None:
        resp = client.get("/api/topics")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_created_topic_appears_in_list(self, client: TestClient) -> None:
        _create_topic(client, "Demand Response")
        resp = client.get("/api/topics")
        names = [t["canonical_name"] for t in resp.json()]
        assert "Demand Response" in names

    def test_search_filter(self, client: TestClient) -> None:
        _create_topic(client, "Superconducting Cable")
        _create_topic(client, "Battery Inverter")
        resp = client.get("/api/topics?search=super")
        names = [t["canonical_name"] for t in resp.json()]
        assert "Superconducting Cable" in names
        assert "Battery Inverter" not in names

    def test_pagination_limit(self, client: TestClient) -> None:
        for i in range(6):
            _create_topic(client, f"Tech List Item {i}")
        resp = client.get("/api/topics?limit=3")
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_filter_pagination_does_not_drop_matches(self, client: TestClient) -> None:
        """Filtering must happen IN SQL, not after pagination.

        list_topics must apply WHERE before OFFSET/LIMIT — otherwise pages of
        non-matching topics return zero rows even when matches exist
        further on. We construct exactly that adversarial layout — many
        Backlog topics followed by one On-Radar topic — and assert the
        filtered query returns the match.
        """
        for i in range(10):
            _create_topic(client, f"Backlog Topic {i:02d}")

        on_radar_resp = client.post(
            "/api/topics",
            json={
                "canonical_name": "On-Radar Promoted Topic ZZ",
                "force_create": True,
                "create_technology": True,
            },
        )
        assert on_radar_resp.status_code == 201
        tech_id = on_radar_resp.json()["technology"]["id"]

        seg_id = client.get("/api/segments").json()[0]["id"]
        client.patch(
            f"/api/technologies/{tech_id}",
            json={
                "registry_status": "On Radar",
                "current_ring": "Pilot",
                "current_segment_id": seg_id,
                "rationale": "Setup for filter test.",
            },
        )

        resp = client.get("/api/topics?registry_status=On Radar&limit=5")
        assert resp.status_code == 200
        names = [t["canonical_name"] for t in resp.json()]
        assert "On-Radar Promoted Topic ZZ" in names, (
            "filter must run in SQL — the match must not be dropped by pagination "
            "over non-matching rows"
        )

    def test_filter_by_ring_in_sql(self, client: TestClient) -> None:
        seg_id = client.get("/api/segments").json()[0]["id"]
        for ring in ("Pilot", "Explore", "Monitor"):
            resp = client.post(
                "/api/topics",
                json={
                    "canonical_name": f"Ring {ring} Topic",
                    "force_create": True,
                    "create_technology": True,
                },
            )
            tech_id = resp.json()["technology"]["id"]
            client.patch(
                f"/api/technologies/{tech_id}",
                json={
                    "registry_status": "On Radar",
                    "current_ring": ring,
                    "current_segment_id": seg_id,
                    "rationale": "test.",
                },
            )

        resp = client.get("/api/topics?ring=Explore")
        names = [t["canonical_name"] for t in resp.json()]
        assert "Ring Explore Topic" in names
        assert "Ring Pilot Topic" not in names
        assert "Ring Monitor Topic" not in names

    def test_filter_by_segment_in_sql(self, client: TestClient) -> None:
        segments = client.get("/api/segments").json()
        seg_a, seg_b = segments[0]["id"], segments[1]["id"]
        layout = (("Segment A Topic", seg_a), ("Segment B Topic", seg_b))
        for name, seg_id in layout:
            resp = client.post(
                "/api/topics",
                json={
                    "canonical_name": name,
                    "force_create": True,
                    "create_technology": True,
                },
            )
            tech_id = resp.json()["technology"]["id"]
            client.patch(
                f"/api/technologies/{tech_id}",
                json={
                    "registry_status": "On Radar",
                    "current_ring": "Pilot",
                    "current_segment_id": seg_id,
                    "rationale": "test.",
                },
            )

        resp = client.get(f"/api/topics?segment_id={seg_a}")
        names = [t["canonical_name"] for t in resp.json()]
        assert "Segment A Topic" in names
        assert "Segment B Topic" not in names

    def test_search_escapes_like_wildcards(self, client: TestClient) -> None:
        """A literal % in the search query must not match arbitrary characters."""
        _create_topic(client, "Plain Topic")
        _create_topic(client, "Another Topic")

        resp = client.get("/api/topics?search=%25")
        names = [t["canonical_name"] for t in resp.json()]
        assert "Plain Topic" not in names
        assert "Another Topic" not in names


class TestTopicDetail:
    def test_get_by_slug_returns_full_detail(self, client: TestClient) -> None:
        topic = _create_topic(client, "Offshore Wind Turbine")
        resp = client.get(f"/api/topics/{topic['slug']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["topic"]["canonical_name"] == "Offshore Wind Turbine"
        assert "aliases" in data
        assert "factsheet" in data
        assert "recent_events" in data
        assert "persons" in data
        assert "peer_references" in data

    def test_get_unknown_slug_returns_404(self, client: TestClient) -> None:
        resp = client.get("/api/topics/nonexistent-topic-slug")
        assert resp.status_code == 404


class TestTopicCreate:
    def test_create_returns_topic(self, client: TestClient) -> None:
        resp = client.post(
            "/api/topics",
            json={"canonical_name": "Pumped Storage Hydro", "force_create": True},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["topic"]["canonical_name"] == "Pumped Storage Hydro"
        assert "grid" not in data["topic"]["slug"]
        assert data["topic"]["slug"] == "pumped-storage-hydro"

    def test_create_also_creates_canonical_alias(
        self, client: TestClient, session: Session
    ) -> None:
        resp = client.post(
            "/api/topics",
            json={"canonical_name": "Virtual Power Plant", "force_create": True},
        )
        topic_id = resp.json()["topic"]["id"]
        aliases = session.exec(select(Alias).where(Alias.topic_id == uuid.UUID(topic_id))).all()
        normalised = [a.alias_name_normalised for a in aliases]
        assert "virtual power plant" in normalised

    def test_exact_duplicate_returns_409(self, client: TestClient) -> None:
        client.post("/api/topics", json={"canonical_name": "Flexline", "force_create": True})
        resp = client.post("/api/topics", json={"canonical_name": "Flexline"})
        assert resp.status_code == 409

    def test_fuzzy_match_returns_candidates(self, client: TestClient) -> None:
        client.post(
            "/api/topics",
            json={"canonical_name": "Grid Scale Energy Storage", "force_create": True},
        )
        resp = client.post(
            "/api/topics",
            json={"canonical_name": "Grid-Scale Energy Storage System"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["topic"] is None
        assert len(data["match_candidates"]) >= 1

    def test_create_with_technology_returns_both(self, client: TestClient) -> None:
        resp = client.post(
            "/api/topics",
            json={
                "canonical_name": "Digital Substation",
                "force_create": True,
                "create_technology": True,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["topic"] is not None
        assert data["technology"] is not None
        assert data["technology"]["registry_status"] == "Backlog"


class TestTopicUpdate:
    def test_update_canonical_name(self, client: TestClient) -> None:
        topic = _create_topic(client, "Old Name Tech")
        resp = client.patch(
            f"/api/topics/{topic['id']}",
            json={"canonical_name": "Updated Name Tech"},
        )
        assert resp.status_code == 200
        assert resp.json()["canonical_name"] == "Updated Name Tech"

    def test_update_not_for_external_publication(self, client: TestClient) -> None:
        topic = _create_topic(client, "Sensitive Technology")
        resp = client.patch(
            f"/api/topics/{topic['id']}",
            json={"not_for_external_publication": True},
        )
        assert resp.status_code == 200
        assert resp.json()["not_for_external_publication"] is True

    def test_update_unknown_topic_returns_404(self, client: TestClient) -> None:
        resp = client.patch(
            f"/api/topics/{uuid.uuid4()}",
            json={"canonical_name": "Ghost"},
        )
        assert resp.status_code == 404


class TestTechnologyHeaderUpdate:
    def _create_with_tech(self, client: TestClient, name: str) -> dict:
        resp = client.post(
            "/api/topics",
            json={
                "canonical_name": name,
                "force_create": True,
                "create_technology": True,
            },
        )
        return resp.json()

    def test_update_registry_status(self, client: TestClient) -> None:
        data = self._create_with_tech(client, "Hydrogen Production Tech")
        tech_id = data["technology"]["id"]
        resp = client.patch(
            f"/api/technologies/{tech_id}",
            json={"registry_status": "Archive", "rationale": "Out of scope."},
        )
        assert resp.status_code == 200
        assert resp.json()["registry_status"] == "Archive"

    def _first_segment_id(self, client: TestClient) -> str:
        """Fetch any seeded segment id — needed for On-Radar transitions
        under the segment-required CHECK constraint."""
        resp = client.get("/api/segments")
        segs = resp.json()
        assert segs, "expected seeded segments"
        return segs[0]["id"]

    def test_archive_clears_ring(self, client: TestClient) -> None:
        data = self._create_with_tech(client, "Carbon Storage Tech")
        tech_id = data["technology"]["id"]
        seg_id = self._first_segment_id(client)
        client.patch(
            f"/api/technologies/{tech_id}",
            json={
                "registry_status": "On Radar",
                "current_ring": "Monitor",
                "current_segment_id": seg_id,
                "rationale": "Putting on radar.",
            },
        )
        resp = client.patch(
            f"/api/technologies/{tech_id}",
            json={"registry_status": "Archive", "rationale": "Archiving."},
        )
        assert resp.status_code == 200
        assert resp.json()["current_ring"] is None

    def test_ring_change_emits_event(self, client: TestClient) -> None:
        data = self._create_with_tech(client, "Fuel Cell System")
        tech_id = data["technology"]["id"]
        topic_slug = data["topic"]["slug"]
        seg_id = self._first_segment_id(client)

        client.patch(
            f"/api/technologies/{tech_id}",
            json={
                "registry_status": "On Radar",
                "current_ring": "Monitor",
                "current_segment_id": seg_id,
                "rationale": "On radar.",
            },
        )
        resp = client.patch(
            f"/api/technologies/{tech_id}",
            json={"current_ring": "Invest", "rationale": "Promoted."},
        )
        assert resp.status_code == 200
        detail = client.get(f"/api/topics/{topic_slug}")
        event_types = [e["event_type"] for e in detail.json()["recent_events"]]
        assert "RingChanged" in event_types

    def test_unknown_tech_returns_404(self, client: TestClient) -> None:
        resp = client.patch(
            f"/api/technologies/{uuid.uuid4()}",
            json={"registry_status": "Archive"},
        )
        assert resp.status_code == 404

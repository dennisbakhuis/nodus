"""Tests for the Topic grouping hierarchy (parent_topic_id)."""

import re
import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.segment import Segment
from app.models.technology import RegistryStatus, Technology
from app.models.topic import Topic


def _on_radar(session: Session, name: str, parent: Topic | None = None) -> Topic:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    seg = session.exec(select(Segment)).first()
    topic = Topic(
        canonical_name=name,
        slug=slug,
        parent_topic_id=parent.id if parent else None,
    )
    session.add(topic)
    session.flush()
    session.add(
        Technology(
            id=uuid.uuid4(),
            topic_id=topic.id,
            registry_status=str(RegistryStatus.OnRadar),
            current_ring="Explore",
            current_segment_id=seg.id,
        )
    )
    session.commit()
    session.refresh(topic)
    return topic


def _create_topic(client: TestClient, name: str, parent_id: str | None = None) -> dict:
    body: dict = {"canonical_name": name, "force_create": True}
    if parent_id is not None:
        body["parent_topic_id"] = parent_id
    resp = client.post("/api/topics", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["topic"]


class TestParentAssignment:
    def test_create_with_parent(self, client: TestClient) -> None:
        parent = _create_topic(client, "Generative AI")
        child = _create_topic(client, "AI Agents", parent_id=parent["id"])
        assert child["parent_topic_id"] == parent["id"]

    def test_patch_sets_and_clears_parent(self, client: TestClient) -> None:
        parent = _create_topic(client, "Generative AI")
        child = _create_topic(client, "AI Agents")
        resp = client.patch(
            f"/api/topics/{child['id']}", json={"parent_topic_id": parent["id"]}
        )
        assert resp.status_code == 200
        assert resp.json()["parent_topic_id"] == parent["id"]

        resp = client.patch(f"/api/topics/{child['id']}", json={"clear_parent": True})
        assert resp.status_code == 200
        assert resp.json()["parent_topic_id"] is None


class TestRejectedParents:
    def test_self_parent_422(self, client: TestClient) -> None:
        topic = _create_topic(client, "Generative AI")
        resp = client.patch(
            f"/api/topics/{topic['id']}", json={"parent_topic_id": topic["id"]}
        )
        assert resp.status_code == 422

    def test_missing_parent_404(self, client: TestClient) -> None:
        topic = _create_topic(client, "Generative AI")
        resp = client.patch(
            f"/api/topics/{topic['id']}",
            json={"parent_topic_id": "00000000-0000-0000-0000-000000000000"},
        )
        assert resp.status_code == 404

    def test_direct_cycle_422(self, client: TestClient) -> None:
        a = _create_topic(client, "A")
        b = _create_topic(client, "B", parent_id=a["id"])
        resp = client.patch(f"/api/topics/{a['id']}", json={"parent_topic_id": b["id"]})
        assert resp.status_code == 422

    def test_transitive_cycle_422(self, client: TestClient) -> None:
        a = _create_topic(client, "A")
        b = _create_topic(client, "B", parent_id=a["id"])
        c = _create_topic(client, "C", parent_id=b["id"])
        resp = client.patch(f"/api/topics/{a['id']}", json={"parent_topic_id": c["id"]})
        assert resp.status_code == 422

    def test_exceeding_max_depth_422(self, client: TestClient) -> None:
        # MAX_GROUP_DEPTH = 5: build a 5-deep chain, a 6th parent assignment fails.
        prev = _create_topic(client, "L1")
        for i in range(2, 6):
            prev = _create_topic(client, f"L{i}", parent_id=prev["id"])
        extra = _create_topic(client, "L6")
        resp = client.patch(
            f"/api/topics/{extra['id']}", json={"parent_topic_id": prev["id"]}
        )
        assert resp.status_code == 422

    def test_parent_requires_writer(self, anon_client: TestClient) -> None:
        resp = anon_client.post(
            "/api/topics", json={"canonical_name": "X", "force_create": True}
        )
        assert resp.status_code in (401, 403)


class TestGroupsTree:
    def test_tree_nesting_and_route_order(self, client: TestClient) -> None:
        gen = _create_topic(client, "Generative AI")
        agents = _create_topic(client, "AI Agents", parent_id=gen["id"])
        _create_topic(client, "Multi-Agent Systems", parent_id=agents["id"])

        resp = client.get("/api/topics/groups-tree")
        assert resp.status_code == 200, resp.text
        tree = resp.json()
        roots = [n for n in tree if n["canonical_name"] == "Generative AI"]
        assert len(roots) == 1
        gen_node = roots[0]
        assert gen_node["children"][0]["canonical_name"] == "AI Agents"
        assert (
            gen_node["children"][0]["children"][0]["canonical_name"] == "Multi-Agent Systems"
        )

    def test_label_group_without_technology(self, client: TestClient) -> None:
        # A topic with no Technology is a pure label; it still appears as a parent.
        label = _create_topic(client, "Artificial Intelligence")
        _create_topic(client, "Generative AI", parent_id=label["id"])
        resp = client.get("/api/topics/groups-tree")
        names = [n["canonical_name"] for n in resp.json()]
        assert "Artificial Intelligence" in names


class TestTopicDetailGrouping:
    def test_ancestors_children_siblings(self, client: TestClient) -> None:
        gen = _create_topic(client, "Generative AI")
        agents = _create_topic(client, "AI Agents", parent_id=gen["id"])
        _create_topic(client, "RAG", parent_id=gen["id"])
        _create_topic(client, "Multi-Agent Systems", parent_id=agents["id"])

        detail = client.get(f"/api/topics/{agents['slug']}").json()
        assert [a["canonical_name"] for a in detail["group_ancestors"]] == ["Generative AI"]
        assert [c["canonical_name"] for c in detail["group_children"]] == ["Multi-Agent Systems"]
        assert [s["canonical_name"] for s in detail["group_siblings"]] == ["RAG"]


class TestDeleteReparents:
    def test_delete_label_reparents_children(self, client: TestClient) -> None:
        grandparent = _create_topic(client, "Artificial Intelligence")
        parent = _create_topic(client, "Generative AI", parent_id=grandparent["id"])
        child = _create_topic(client, "AI Agents", parent_id=parent["id"])

        resp = client.delete(f"/api/topics/{parent['id']}")
        assert resp.status_code == 204

        detail = client.get(f"/api/topics/{child['slug']}").json()
        assert detail["topic"]["parent_topic_id"] == grandparent["id"]

    def test_delete_on_radar_topic_409(self, client: TestClient) -> None:
        resp = client.post(
            "/api/topics",
            json={
                "canonical_name": "Edge AI",
                "force_create": True,
                "create_technology": True,
            },
        )
        topic_id = resp.json()["topic"]["id"]
        resp = client.delete(f"/api/topics/{topic_id}")
        assert resp.status_code == 409


class TestSeedHierarchy:
    def test_seed_creates_example_hierarchy_idempotently(self, session: Session) -> None:
        from app.seed.dummy import seed_dummy

        counts = seed_dummy(session)
        assert counts["groups"] == 9

        by_slug = {t.slug: t for t in session.exec(select(Topic)).all()}
        by_id = {t.id: t for t in by_slug.values()}
        chain = []
        cur: Topic | None = by_slug["multi-agent-systems"]
        while cur is not None:
            chain.append(cur.canonical_name)
            cur = by_id.get(cur.parent_topic_id) if cur.parent_topic_id else None
        assert chain == [
            "Multi-Agent Systems",
            "AI Agents",
            "Generative AI",
            "Artificial Intelligence",
        ]
        # Re-running links nothing new.
        assert seed_dummy(session)["groups"] == 0


class TestRadarPayloadGrouping:
    def test_ancestor_path_and_root(self, client: TestClient, session: Session) -> None:
        client.post("/api/cycles", json={"name": "C1", "start_date": "2026-01-01"})
        gen = _on_radar(session, "Generative AI")
        agents = _on_radar(session, "AI Agents", parent=gen)
        _on_radar(session, "Multi-Agent Systems", parent=agents)

        entries = {e["canonical_name"]: e for e in client.get("/api/radar/current").json()["entries"]}
        mas_entry = entries["Multi-Agent Systems"]
        assert mas_entry["ancestor_path"] == [str(gen.id), str(agents.id)]
        assert mas_entry["root_group_id"] == str(gen.id)
        assert mas_entry["parent_topic_id"] == str(agents.id)
        # Root group's own root_group_id is itself.
        assert entries["Generative AI"]["root_group_id"] == str(gen.id)

    def test_private_ancestor_collapsed_for_public(
        self, anon_client: TestClient, session: Session
    ) -> None:
        session.add(
            Segment(name="Pub", slug="pub", display_order=9, theme_key="dark-blue")
        )
        from datetime import date

        from app.models.cycle import Cycle

        session.add(Cycle(name="C1", start_date=date(2026, 1, 1)))
        session.commit()

        # Private umbrella -> public child. Public viewer must not see the umbrella.
        umbrella = _on_radar(session, "Private Umbrella")
        umbrella.not_for_external_publication = True
        session.add(umbrella)
        session.commit()
        child = _on_radar(session, "Public Child", parent=umbrella)

        entries = {
            e["canonical_name"]: e
            for e in anon_client.get("/api/radar/current").json()["entries"]
        }
        assert "Private Umbrella" not in entries
        child_entry = entries["Public Child"]
        # Private ancestor collapsed out; child becomes its own root group.
        assert child_entry["ancestor_path"] == []
        assert child_entry["root_group_id"] == str(child.id)
        assert child_entry["parent_topic_id"] is None

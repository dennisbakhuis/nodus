"""Adopted must behave exactly as Archive does on the radar: absent unless asked for."""

from fastapi.testclient import TestClient


def _make(client: TestClient, name: str) -> str:
    resp = client.post("/api/topics", json={"canonical_name": name, "create_technology": True})
    return resp.json()["technology"]["id"]


def _segment(client: TestClient) -> str:
    return client.get("/api/segments").json()[0]["id"]


def test_adopted_and_archive_behave_the_same_on_the_radar(client: TestClient) -> None:
    seg = _segment(client)
    ids = {}
    for name, status in (("Adopted Widget", "Adopted"), ("Archived Widget", "Archive")):
        tech_id = _make(client, name)
        client.patch(
            f"/api/technologies/{tech_id}",
            json={
                "registry_status": "On Radar",
                "current_ring": "Invest",
                "current_segment_id": seg,
                "rationale": "on radar first",
            },
        )
        client.patch(
            f"/api/technologies/{tech_id}",
            json={"registry_status": status, "rationale": "leaving the radar"},
        )
        ids[status] = tech_id

    default = client.get("/api/radar/current").json()
    names = {e["canonical_name"] for e in default["entries"]}
    assert "Adopted Widget" not in names, "Adopted must not be plotted by default"
    assert "Archived Widget" not in names, "Archive must not be plotted by default"

    counts = {}
    for status in ("Adopted", "Archive"):
        opted_in = client.get(f"/api/radar/current?include_status={status}").json()
        counts[status] = len(opted_in["entries"])
    assert counts["Adopted"] == counts["Archive"], (
        f"Adopted and Archive must behave identically on the radar, got {counts}"
    )

    for status, tech_id in ids.items():
        tech = client.get(f"/api/topics/{'adopted-widget' if status == 'Adopted' else 'archived-widget'}").json()
        assert tech["technology"]["current_ring"] is None
        assert tech["technology"]["current_segment_id"] is None

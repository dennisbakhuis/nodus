"""The TRL scale is 1-9; nothing outside it may be written.

The table CHECK is wider so databases holding rows imported against an extended
range still load, but request validation is the gate for every write.
"""

from fastapi.testclient import TestClient
import pytest


def _technology_id(client: TestClient, name: str) -> str:
    """Create a topic with a technology and return the technology id."""
    resp = client.post("/api/topics", json={"canonical_name": name, "create_technology": True})
    return resp.json()["technology"]["id"]


@pytest.mark.parametrize("trl", [1, 5, 9])
def test_trl_within_scale_is_accepted(client: TestClient, trl: int) -> None:
    """Every value on the 1-9 scale is written."""
    tech_id = _technology_id(client, f"TRL In Range {trl}")
    resp = client.post(
        f"/api/technologies/{tech_id}/factsheet",
        json={"summary": "s", "assessment": {"trl": trl}},
    )
    assert resp.status_code == 201


@pytest.mark.parametrize("trl", [0, 10, 12, 13, -1])
def test_trl_outside_scale_is_rejected(client: TestClient, trl: int) -> None:
    """Anything off the scale is a 422, not a row the UI cannot render."""
    tech_id = _technology_id(client, f"TRL Out Of Range {trl}")
    resp = client.post(
        f"/api/technologies/{tech_id}/factsheet",
        json={"summary": "s", "assessment": {"trl": trl}},
    )
    assert resp.status_code == 422

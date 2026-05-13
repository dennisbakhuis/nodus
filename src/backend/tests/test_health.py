from fastapi.testclient import TestClient


def test_health_returns_ok_and_version(client: TestClient) -> None:
    """GET /api/health returns status ok with the running app version."""
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert isinstance(body["version"], str) and body["version"]

from fastapi.testclient import TestClient

from project_management.main import app

client = TestClient(app)


def test_health_endpoint_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "project-management-api",
    }


def test_root_serves_static_page() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Product Launch" in response.text or "Hello world from FastAPI" in response.text

from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from project_management import ai, main
from project_management.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PROJECT_MANAGEMENT_DB_PATH", str(tmp_path / "test.db"))
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "project-management-api",
    }


def test_root_serves_static_page(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Kanban MVP" in response.text or "Hello world from FastAPI" in response.text


def test_board_endpoint_returns_seeded_board(client: TestClient) -> None:
    response = client.get("/api/board")

    assert response.status_code == 200
    board = response.json()
    assert board["name"] == "Product Launch"
    assert [column["id"] for column in board["columns"]] == [
        "backlog",
        "ready",
        "progress",
        "review",
        "done",
    ]
    assert board["columns"][0]["cards"][0]["id"] == "card-positioning"


def test_board_mutation_routes(client: TestClient) -> None:
    rename_response = client.patch("/api/columns/backlog", json={"name": "Ideas"})
    assert rename_response.status_code == 200
    assert rename_response.json()["columns"][0]["name"] == "Ideas"

    create_response = client.post(
        "/api/cards",
        json={"columnId": "backlog", "title": "Partner announcement", "details": "Draft note"},
    )
    assert create_response.status_code == 200
    created_card = create_response.json()["columns"][0]["cards"][-1]
    assert created_card["title"] == "Partner announcement"

    update_response = client.patch(
        f"/api/cards/{created_card['id']}",
        json={"title": "Partner launch announcement", "details": "Draft the launch note"},
    )
    assert update_response.status_code == 200
    updated_card = update_response.json()["columns"][0]["cards"][-1]
    assert updated_card["title"] == "Partner launch announcement"

    move_response = client.post(
        f"/api/cards/{created_card['id']}/move",
        json={"targetColumnId": "review"},
    )
    assert move_response.status_code == 200
    review_cards = move_response.json()["columns"][3]["cards"]
    assert review_cards[-1]["id"] == created_card["id"]

    delete_response = client.delete(f"/api/cards/{created_card['id']}")
    assert delete_response.status_code == 200
    all_card_ids = [
        card["id"]
        for column in delete_response.json()["columns"]
        for card in column["cards"]
    ]
    assert created_card["id"] not in all_card_ids


def test_api_changes_survive_backend_restart(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_MANAGEMENT_DB_PATH", str(tmp_path / "test.db"))

    with TestClient(app) as first_client:
        response = first_client.post(
            "/api/cards",
            json={"columnId": "done", "title": "Persistent card", "details": ""},
        )
        assert response.status_code == 200

    with TestClient(app) as second_client:
        response = second_client.get("/api/board")

    done_cards = response.json()["columns"][4]["cards"]
    assert done_cards[-1]["title"] == "Persistent card"


def test_unknown_api_route_returns_not_found(client: TestClient) -> None:
    response = client.get("/api/missing")

    assert response.status_code == 404


def test_static_asset_rejects_path_traversal() -> None:
    response = main.static_asset("../../../../etc/hosts")

    served = Path(response.path).resolve()
    assert served == (main.STATIC_DIR.resolve() / "index.html")


def test_ai_dev_probe_endpoint_is_disabled_by_default(client: TestClient) -> None:
    response = client.post("/api/dev/ai/ask-2-plus-2")

    assert response.status_code == 404


def test_ai_dev_probe_endpoint_reports_missing_api_key(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_MANAGEMENT_ENABLE_AI_DEV_ENDPOINT", "true")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = client.post("/api/dev/ai/ask-2-plus-2")

    assert response.status_code == 503
    assert response.json()["detail"] == "OPENROUTER_API_KEY is not set"


def test_ai_dev_probe_endpoint_uses_configured_model(client: TestClient, monkeypatch) -> None:
    class FakeOpenRouterClient:
        def __init__(self, settings: ai.AISettings) -> None:
            self.settings = settings

        def ask(self, question: str) -> str:
            assert question == "What is 2+2? Answer with only the number."
            return "4"

    monkeypatch.setenv("PROJECT_MANAGEMENT_ENABLE_AI_DEV_ENDPOINT", "true")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "custom/model")
    monkeypatch.setattr(ai, "OpenRouterClient", FakeOpenRouterClient)

    response = client.post("/api/dev/ai/ask-2-plus-2")

    assert response.status_code == 200
    assert response.json() == {
        "question": "What is 2+2? Answer with only the number.",
        "answer": "4",
        "model": "custom/model",
    }


def test_chat_route_returns_ai_message_without_board_update(client: TestClient, monkeypatch) -> None:
    class FakeOpenRouterClient:
        def chat(self, messages, response_format=None) -> str:
            assert response_format == {"type": "json_object"}
            assert messages[-1] == {"role": "user", "content": "What should I do next?"}
            return '{"message":"Review the launch checklist.","actions":[]}'

    monkeypatch.setattr(ai, "OpenRouterClient", FakeOpenRouterClient)

    response = client.post(
        "/api/chat",
        json={
            "message": "What should I do next?",
            "history": [{"role": "assistant", "content": "Hi"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Review the launch checklist.",
        "boardChanged": False,
        "board": None,
    }


def test_chat_route_applies_ai_board_updates(client: TestClient, monkeypatch) -> None:
    class FakeOpenRouterClient:
        def chat(self, messages, response_format=None) -> str:
            return """
            {
              "message": "Added the partner card.",
              "actions": [
                {
                  "type": "create_card",
                  "columnId": "backlog",
                  "title": "Partner launch",
                  "details": "Draft the partner announcement."
                }
              ]
            }
            """

    monkeypatch.setattr(ai, "OpenRouterClient", FakeOpenRouterClient)

    response = client.post("/api/chat", json={"message": "Add a partner launch card"})

    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "Added the partner card."
    assert body["boardChanged"] is True
    assert body["board"]["columns"][0]["cards"][-1]["title"] == "Partner launch"


def test_chat_route_rejects_invalid_ai_output_without_changing_board(
    client: TestClient,
    monkeypatch,
) -> None:
    class FakeOpenRouterClient:
        def chat(self, messages, response_format=None) -> str:
            return """
            {
              "message": "Invalid update.",
              "actions": [
                {"type": "create_card", "columnId": "backlog", "title": "Should not save"},
                {"type": "delete_card", "cardId": "missing-card"}
              ]
            }
            """

    monkeypatch.setattr(ai, "OpenRouterClient", FakeOpenRouterClient)

    response = client.post("/api/chat", json={"message": "Make an invalid change"})

    assert response.status_code == 502
    board_response = client.get("/api/board")
    card_titles = [
        card["title"]
        for column in board_response.json()["columns"]
        for card in column["cards"]
    ]
    assert "Should not save" not in card_titles

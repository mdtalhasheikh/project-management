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


# ─── Health ───────────────────────────────────────────────────────────────────


def test_health_endpoint_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "project-management-api",
    }


# ─── Static file serving ──────────────────────────────────────────────────────


def test_root_serves_static_page(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Kanban MVP" in response.text or "Hello world from FastAPI" in response.text


def test_unknown_api_route_returns_not_found(client: TestClient) -> None:
    response = client.get("/api/missing")

    assert response.status_code == 404


def test_static_asset_rejects_path_traversal() -> None:
    response = main.static_asset("../../../../etc/hosts")

    served = Path(response.path).resolve()
    assert served == (main.STATIC_DIR.resolve() / "index.html")


# ─── Board listing and retrieval ──────────────────────────────────────────────


def test_list_boards_returns_seeded_board(client: TestClient) -> None:
    response = client.get("/api/boards")

    assert response.status_code == 200
    boards = response.json()
    assert len(boards) == 1
    assert boards[0]["name"] == "Product Launch"
    assert boards[0]["cardCount"] == 7
    assert "id" in boards[0]


def test_get_board_returns_seeded_data(client: TestClient) -> None:
    board_id = client.get("/api/boards").json()[0]["id"]
    response = client.get(f"/api/boards/{board_id}")

    assert response.status_code == 200
    board = response.json()
    assert board["name"] == "Product Launch"
    assert [col["id"] for col in board["columns"]] == [
        "backlog", "ready", "progress", "review", "done"
    ]
    assert board["columns"][0]["cards"][0]["id"] == "card-positioning"


def test_get_board_returns_404_for_unknown_id(client: TestClient) -> None:
    response = client.get("/api/boards/99999")

    assert response.status_code == 404


# ─── Board CRUD ───────────────────────────────────────────────────────────────


def test_create_board_adds_default_columns(client: TestClient) -> None:
    response = client.post("/api/boards", json={"name": "Sprint Planning"})

    assert response.status_code == 200
    board = response.json()
    assert board["name"] == "Sprint Planning"
    assert len(board["columns"]) == 5
    assert board["columns"][0]["name"] == "Backlog"

    boards = client.get("/api/boards").json()
    assert len(boards) == 2
    assert any(b["name"] == "Sprint Planning" for b in boards)


def test_rename_board(client: TestClient) -> None:
    board_id = client.get("/api/boards").json()[0]["id"]
    response = client.patch(f"/api/boards/{board_id}", json={"name": "Q3 Launch"})

    assert response.status_code == 200
    assert response.json()["name"] == "Q3 Launch"


def test_delete_board_returns_updated_list(client: TestClient) -> None:
    client.post("/api/boards", json={"name": "Temp Board"})
    boards = client.get("/api/boards").json()
    assert len(boards) == 2

    temp_id = next(b["id"] for b in boards if b["name"] == "Temp Board")
    response = client.delete(f"/api/boards/{temp_id}")

    assert response.status_code == 200
    remaining = response.json()
    assert len(remaining) == 1
    assert remaining[0]["name"] == "Product Launch"


def test_delete_last_board_returns_400(client: TestClient) -> None:
    board_id = client.get("/api/boards").json()[0]["id"]
    response = client.delete(f"/api/boards/{board_id}")

    assert response.status_code == 400
    assert "last board" in response.json()["detail"]


def test_board_data_persists_across_client_restarts(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_MANAGEMENT_DB_PATH", str(tmp_path / "test.db"))

    with TestClient(app) as first_client:
        board_id = first_client.get("/api/boards").json()[0]["id"]
        first_client.post("/api/boards", json={"name": "Persistent Board"})

    with TestClient(app) as second_client:
        boards = second_client.get("/api/boards").json()

    assert any(b["name"] == "Persistent Board" for b in boards)


# ─── Column CRUD ──────────────────────────────────────────────────────────────


def test_create_column_appends_to_board(client: TestClient) -> None:
    board_id = client.get("/api/boards").json()[0]["id"]
    response = client.post(f"/api/boards/{board_id}/columns", json={"name": "Blocked"})

    assert response.status_code == 200
    board = response.json()
    col_names = [col["name"] for col in board["columns"]]
    assert col_names[-1] == "Blocked"
    assert len(board["columns"]) == 6


def test_rename_column(client: TestClient) -> None:
    board_id = client.get("/api/boards").json()[0]["id"]
    response = client.patch(
        f"/api/boards/{board_id}/columns/backlog",
        json={"name": "Ideas"},
    )

    assert response.status_code == 200
    board = response.json()
    assert board["columns"][0]["name"] == "Ideas"


def test_delete_column_removes_it_and_its_cards(client: TestClient) -> None:
    board_id = client.get("/api/boards").json()[0]["id"]
    response = client.delete(f"/api/boards/{board_id}/columns/backlog")

    assert response.status_code == 200
    board = response.json()
    col_ids = [col["id"] for col in board["columns"]]
    assert "backlog" not in col_ids
    assert len(board["columns"]) == 4


def test_delete_last_column_returns_400(client: TestClient) -> None:
    board_id = client.get("/api/boards").json()[0]["id"]
    board = client.get(f"/api/boards/{board_id}").json()
    col_ids = [col["id"] for col in board["columns"]]

    for col_id in col_ids[:-1]:
        client.delete(f"/api/boards/{board_id}/columns/{col_id}")

    response = client.delete(f"/api/boards/{board_id}/columns/{col_ids[-1]}")
    assert response.status_code == 400


def test_column_positions_are_compacted_after_delete(client: TestClient) -> None:
    board_id = client.get("/api/boards").json()[0]["id"]
    client.delete(f"/api/boards/{board_id}/columns/ready")
    board = client.get(f"/api/boards/{board_id}").json()

    col_names = [col["name"] for col in board["columns"]]
    assert col_names == ["Backlog", "In Progress", "Review", "Done"]


# ─── Card CRUD ────────────────────────────────────────────────────────────────


def test_card_mutation_routes(client: TestClient) -> None:
    board_id = client.get("/api/boards").json()[0]["id"]

    create_resp = client.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "backlog", "title": "Partner announcement", "details": "Draft note"},
    )
    assert create_resp.status_code == 200
    created_card = create_resp.json()["columns"][0]["cards"][-1]
    assert created_card["title"] == "Partner announcement"

    update_resp = client.patch(
        f"/api/boards/{board_id}/cards/{created_card['id']}",
        json={"title": "Partner launch announcement", "details": "Updated note"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["columns"][0]["cards"][-1]["title"] == "Partner launch announcement"

    move_resp = client.post(
        f"/api/boards/{board_id}/cards/{created_card['id']}/move",
        json={"targetColumnId": "review"},
    )
    assert move_resp.status_code == 200
    review_cards = move_resp.json()["columns"][3]["cards"]
    assert review_cards[-1]["id"] == created_card["id"]

    delete_resp = client.delete(f"/api/boards/{board_id}/cards/{created_card['id']}")
    assert delete_resp.status_code == 200
    all_card_ids = [
        card["id"]
        for col in delete_resp.json()["columns"]
        for card in col["cards"]
    ]
    assert created_card["id"] not in all_card_ids


def test_card_mutations_are_board_scoped(client: TestClient) -> None:
    client.post("/api/boards", json={"name": "Second Board"})
    boards = client.get("/api/boards").json()
    board1_id = boards[0]["id"]
    board2_id = boards[1]["id"]

    create_resp = client.post(
        f"/api/boards/{board1_id}/cards",
        json={"columnId": "backlog", "title": "Board 1 card", "details": ""},
    )
    card_id = create_resp.json()["columns"][0]["cards"][-1]["id"]

    response = client.delete(f"/api/boards/{board2_id}/cards/{card_id}")
    assert response.status_code == 404


def test_card_changes_survive_restart(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROJECT_MANAGEMENT_DB_PATH", str(tmp_path / "test.db"))

    with TestClient(app) as first_client:
        board_id = first_client.get("/api/boards").json()[0]["id"]
        first_client.post(
            f"/api/boards/{board_id}/cards",
            json={"columnId": "done", "title": "Persistent card", "details": ""},
        )

    with TestClient(app) as second_client:
        board_id = second_client.get("/api/boards").json()[0]["id"]
        board = second_client.get(f"/api/boards/{board_id}").json()

    done_cards = board["columns"][4]["cards"]
    assert done_cards[-1]["title"] == "Persistent card"


# ─── AI chat ──────────────────────────────────────────────────────────────────


def test_chat_route_returns_ai_message_without_board_update(client: TestClient, monkeypatch) -> None:
    class FakeOpenRouterClient:
        def chat(self, messages, response_format=None) -> str:
            assert response_format == {"type": "json_object"}
            assert messages[-1] == {"role": "user", "content": "What should I do next?"}
            return '{"message":"Review the launch checklist.","actions":[]}'

    monkeypatch.setattr(ai, "OpenRouterClient", FakeOpenRouterClient)
    board_id = client.get("/api/boards").json()[0]["id"]

    response = client.post(
        f"/api/boards/{board_id}/chat",
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
    board_id = client.get("/api/boards").json()[0]["id"]

    response = client.post(
        f"/api/boards/{board_id}/chat",
        json={"message": "Add a partner launch card"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "Added the partner card."
    assert body["boardChanged"] is True
    assert body["board"]["columns"][0]["cards"][-1]["title"] == "Partner launch"


def test_chat_route_rejects_invalid_ai_output(client: TestClient, monkeypatch) -> None:
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
    board_id = client.get("/api/boards").json()[0]["id"]

    response = client.post(
        f"/api/boards/{board_id}/chat",
        json={"message": "Make an invalid change"},
    )

    assert response.status_code == 502
    board_resp = client.get(f"/api/boards/{board_id}").json()
    titles = [card["title"] for col in board_resp["columns"] for card in col["cards"]]
    assert "Should not save" not in titles


def test_chat_route_returns_404_for_unknown_board(client: TestClient, monkeypatch) -> None:
    class FakeOpenRouterClient:
        def chat(self, messages, response_format=None) -> str:
            return '{"message":"ok","actions":[]}'

    monkeypatch.setattr(ai, "OpenRouterClient", FakeOpenRouterClient)

    response = client.post("/api/boards/99999/chat", json={"message": "hello"})

    assert response.status_code == 404


# ─── Dev probe ────────────────────────────────────────────────────────────────


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

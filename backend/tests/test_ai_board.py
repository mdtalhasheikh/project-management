import pytest

from project_management import ai_board, database


def test_parse_ai_chat_result_accepts_structured_actions() -> None:
    result = ai_board.parse_ai_chat_result(
        """
        {
          "message": "Created the card.",
          "actions": [
            {
              "type": "create_card",
              "columnId": "backlog",
              "title": "New card",
              "details": "Draft it"
            }
          ]
        }
        """
    )

    assert result.message == "Created the card."
    assert len(result.actions) == 1


def test_parse_ai_chat_result_rejects_invalid_output() -> None:
    with pytest.raises(ValueError, match="AI response did not match"):
        ai_board.parse_ai_chat_result('{"message":"Missing action type","actions":[{}]}')


def test_ai_create_card_action_persists(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("PROJECT_MANAGEMENT_DB_PATH", str(tmp_path / "test.db"))
    board = database.get_board()
    result = ai_board.parse_ai_chat_result(
        """
        {
          "message": "Added it.",
          "actions": [
            {"type": "create_card", "columnId": "backlog", "title": "AI card", "details": "Created by AI"}
          ]
        }
        """
    )

    response = ai_board.apply_ai_chat_result(result, board)

    assert response.boardChanged is True
    assert response.board is not None
    assert response.board["columns"][0]["cards"][-1]["title"] == "AI card"
    assert database.get_board()["columns"][0]["cards"][-1]["title"] == "AI card"


def test_ai_update_move_and_delete_actions_persist(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("PROJECT_MANAGEMENT_DB_PATH", str(tmp_path / "test.db"))
    board = database.get_board()
    result = ai_board.parse_ai_chat_result(
        """
        {
          "message": "Updated the board.",
          "actions": [
            {
              "type": "update_card",
              "cardId": "card-brief",
              "title": "Creative brief updated",
              "details": "Refresh the design brief."
            },
            {"type": "move_card", "cardId": "card-brief", "targetColumnId": "review"},
            {"type": "delete_card", "cardId": "card-pricing"}
          ]
        }
        """
    )

    response = ai_board.apply_ai_chat_result(result, board)

    assert response.boardChanged is True
    assert response.board is not None
    review_cards = response.board["columns"][3]["cards"]
    assert review_cards[-1]["title"] == "Creative brief updated"
    assert "card-pricing" not in [card["id"] for card in review_cards]


def test_invalid_ai_action_does_not_change_board(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("PROJECT_MANAGEMENT_DB_PATH", str(tmp_path / "test.db"))
    board = database.get_board()
    result = ai_board.parse_ai_chat_result(
        """
        {
          "message": "Trying an invalid update.",
          "actions": [
            {"type": "create_card", "columnId": "backlog", "title": "Should not save"},
            {"type": "move_card", "cardId": "missing-card", "targetColumnId": "done"}
          ]
        }
        """
    )

    with pytest.raises(ValueError, match="unknown card or column"):
        ai_board.apply_ai_chat_result(result, board)

    card_titles = [
        card["title"]
        for column in database.get_board()["columns"]
        for card in column["cards"]
    ]
    assert "Should not save" not in card_titles


def test_no_action_response_does_not_return_board(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("PROJECT_MANAGEMENT_DB_PATH", str(tmp_path / "test.db"))
    board = database.get_board()
    result = ai_board.parse_ai_chat_result('{"message":"No change needed.","actions":[]}')

    response = ai_board.apply_ai_chat_result(result, board)

    assert response.message == "No change needed."
    assert response.boardChanged is False
    assert response.board is None

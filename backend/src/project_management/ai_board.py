from __future__ import annotations

import json
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from project_management import ai, database


class ChatHistoryMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str


class CreateCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["create_card"]
    columnId: str
    title: str
    details: str = ""


class UpdateCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["update_card"]
    cardId: str
    title: str
    details: str = ""


class MoveCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["move_card"]
    cardId: str
    targetColumnId: str


class DeleteCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["delete_card"]
    cardId: str


BoardAction = Annotated[
    CreateCardAction | UpdateCardAction | MoveCardAction | DeleteCardAction,
    Field(discriminator="type"),
]


class AIChatResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str
    actions: list[BoardAction] = []


class ChatResponse(BaseModel):
    message: str
    boardChanged: bool
    board: dict[str, Any] | None = None


AI_RESPONSE_ADAPTER = TypeAdapter(AIChatResult)


def build_chat_messages(
    user_message: str,
    history: list[ChatHistoryMessage],
    board: dict[str, Any],
) -> list[ai.ChatMessage]:
    system_prompt = (
        "You help manage a Kanban board. Return only JSON with this shape: "
        '{"message":"user-facing reply","actions":[]}. '
        "Allowed actions are create_card, update_card, move_card, and delete_card. "
        "Use existing card and column ids exactly as provided. "
        "For create_card use columnId, title, and optional details. "
        "For update_card use cardId, title, and optional details. "
        "For move_card use cardId and targetColumnId. "
        "For delete_card use cardId. "
        "If no board update is needed, return an empty actions array."
    )
    history_messages: list[ai.ChatMessage] = [
        {"role": message.role, "content": message.content} for message in history
    ]
    board_context = json.dumps(board, separators=(",", ":"))
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Current board JSON: {board_context}"},
        *history_messages,
        {"role": "user", "content": user_message},
    ]


def parse_ai_chat_result(raw_response: str) -> AIChatResult:
    try:
        data = json.loads(_strip_json_fence(raw_response))
        result = AI_RESPONSE_ADAPTER.validate_python(data)
    except (json.JSONDecodeError, ValidationError) as error:
        raise ValueError("AI response did not match the board update contract") from error

    if not result.message.strip():
        raise ValueError("AI response message is required")
    return result


def apply_ai_chat_result(result: AIChatResult, board: dict[str, Any]) -> ChatResponse:
    validate_actions(result.actions, board)

    changed_board = board
    for action in result.actions:
        if isinstance(action, CreateCardAction):
            changed_board = database.create_card(action.columnId, action.title, action.details)
        elif isinstance(action, UpdateCardAction):
            changed_board = database.update_card(action.cardId, action.title, action.details)
        elif isinstance(action, MoveCardAction):
            changed_board = database.move_card(action.cardId, action.targetColumnId)
        elif isinstance(action, DeleteCardAction):
            changed_board = database.delete_card(action.cardId)

    return ChatResponse(
        message=result.message.strip(),
        boardChanged=bool(result.actions),
        board=changed_board if result.actions else None,
    )


def validate_actions(actions: list[BoardAction], board: dict[str, Any]) -> None:
    column_ids = {column["id"] for column in board["columns"]}
    card_ids = {card["id"] for column in board["columns"] for card in column["cards"]}

    for action in actions:
        if isinstance(action, CreateCardAction):
            if action.columnId not in column_ids:
                raise ValueError("AI response referenced an unknown column")
            if not action.title.strip():
                raise ValueError("AI response tried to create a card without a title")
        elif isinstance(action, UpdateCardAction):
            if action.cardId not in card_ids:
                raise ValueError("AI response referenced an unknown card")
            if not action.title.strip():
                raise ValueError("AI response tried to update a card without a title")
        elif isinstance(action, MoveCardAction):
            if action.cardId not in card_ids or action.targetColumnId not in column_ids:
                raise ValueError("AI response referenced an unknown card or column")
        elif isinstance(action, DeleteCardAction):
            if action.cardId not in card_ids:
                raise ValueError("AI response referenced an unknown card")
            card_ids.remove(action.cardId)


def _strip_json_fence(raw_response: str) -> str:
    response = raw_response.strip()
    if response.startswith("```json"):
        response = response.removeprefix("```json").strip()
    elif response.startswith("```"):
        response = response.removeprefix("```").strip()
    if response.endswith("```"):
        response = response.removesuffix("```").strip()
    return response

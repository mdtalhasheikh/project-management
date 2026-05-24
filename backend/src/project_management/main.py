import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from project_management import ai
from project_management import ai_board
from project_management import database

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
FRONTEND_OUT_DIR = PROJECT_ROOT / "frontend" / "out"
FALLBACK_STATIC_DIR = BACKEND_DIR / "static"
STATIC_DIR = FRONTEND_OUT_DIR if FRONTEND_OUT_DIR.exists() else FALLBACK_STATIC_DIR


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.initialize_database()
    yield


app = FastAPI(title="Project Management API", lifespan=lifespan)

if (STATIC_DIR / "_next").exists():
    app.mount("/_next", StaticFiles(directory=STATIC_DIR / "_next"), name="next_static")


# ─── Health ───────────────────────────────────────────────────────────────────


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "project-management-api"}


# ─── Request models ───────────────────────────────────────────────────────────


class CreateBoardRequest(BaseModel):
    name: str


class RenameBoardRequest(BaseModel):
    name: str


class CreateColumnRequest(BaseModel):
    name: str


class RenameColumnRequest(BaseModel):
    name: str


class CreateCardRequest(BaseModel):
    columnId: str
    title: str
    details: str = ""


class UpdateCardRequest(BaseModel):
    title: str
    details: str = ""


class MoveCardRequest(BaseModel):
    targetColumnId: str


class ChatRequest(BaseModel):
    message: str
    history: list[ai_board.ChatHistoryMessage] = []


class AIProbeResponse(BaseModel):
    question: str
    answer: str
    model: str


# ─── Board routes ─────────────────────────────────────────────────────────────


@app.get("/api/boards")
def list_boards() -> list[dict[str, Any]]:
    return database.list_boards()


@app.post("/api/boards")
def create_board(request: CreateBoardRequest) -> dict[str, Any]:
    return database.create_board(request.name)


@app.get("/api/boards/{board_id}")
def get_board(board_id: int) -> dict[str, Any]:
    try:
        return database.get_board(board_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.patch("/api/boards/{board_id}")
def rename_board(board_id: int, request: RenameBoardRequest) -> dict[str, Any]:
    try:
        return database.rename_board(board_id, request.name)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.delete("/api/boards/{board_id}")
def delete_board(board_id: int) -> list[dict[str, Any]]:
    try:
        return database.delete_board(board_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# ─── Column routes ────────────────────────────────────────────────────────────


@app.post("/api/boards/{board_id}/columns")
def create_column(board_id: int, request: CreateColumnRequest) -> dict[str, Any]:
    try:
        return database.create_column(board_id, request.name)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.patch("/api/boards/{board_id}/columns/{column_id}")
def rename_column(board_id: int, column_id: str, request: RenameColumnRequest) -> dict[str, Any]:
    try:
        return database.rename_column(column_id, request.name, board_id=board_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.delete("/api/boards/{board_id}/columns/{column_id}")
def delete_column(board_id: int, column_id: str) -> dict[str, Any]:
    try:
        return database.delete_column(column_id, board_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# ─── Card routes ──────────────────────────────────────────────────────────────


@app.post("/api/boards/{board_id}/cards")
def create_card(board_id: int, request: CreateCardRequest) -> dict[str, Any]:
    try:
        return database.create_card(request.columnId, request.title, request.details, board_id=board_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.patch("/api/boards/{board_id}/cards/{card_id}")
def update_card(board_id: int, card_id: str, request: UpdateCardRequest) -> dict[str, Any]:
    try:
        return database.update_card(card_id, request.title, request.details, board_id=board_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.delete("/api/boards/{board_id}/cards/{card_id}")
def delete_card(board_id: int, card_id: str) -> dict[str, Any]:
    try:
        return database.delete_card(card_id, board_id=board_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/api/boards/{board_id}/cards/{card_id}/move")
def move_card(board_id: int, card_id: str, request: MoveCardRequest) -> dict[str, Any]:
    try:
        return database.move_card(card_id, request.targetColumnId, board_id=board_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


# ─── AI Chat ──────────────────────────────────────────────────────────────────


@app.post("/api/boards/{board_id}/chat")
def chat_with_ai(board_id: int, request: ChatRequest) -> ai_board.ChatResponse:
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    try:
        board = database.get_board(board_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    messages = ai_board.build_chat_messages(request.message, request.history, board)
    try:
        raw_response = ai.OpenRouterClient().chat(
            messages,
            response_format={"type": "json_object"},
        )
        result = ai_board.parse_ai_chat_result(raw_response)
        return ai_board.apply_ai_chat_result(result, board, board_id=board_id)
    except ai.AIConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        logger.warning("AI chat response rejected: %s", error)
        raise HTTPException(status_code=502, detail=str(error)) from error
    except (httpx.HTTPError, RuntimeError) as error:
        logger.exception("OpenRouter chat request failed")
        raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {error}") from error


# ─── Dev probe ────────────────────────────────────────────────────────────────


@app.post("/api/dev/ai/ask-2-plus-2")
def ask_ai_two_plus_two() -> AIProbeResponse:
    if os.environ.get("PROJECT_MANAGEMENT_ENABLE_AI_DEV_ENDPOINT") != "true":
        raise HTTPException(status_code=404, detail="API route not found")

    question = "What is 2+2? Answer with only the number."
    try:
        settings = ai.get_ai_settings()
        answer = ai.OpenRouterClient(settings).ask(question)
    except ai.AIConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (httpx.HTTPError, RuntimeError) as error:
        logger.exception("OpenRouter probe request failed")
        raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {error}") from error

    return AIProbeResponse(question=question, answer=answer, model=settings.model)


# ─── Static files ─────────────────────────────────────────────────────────────


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/{asset_path:path}", include_in_schema=False)
def static_asset(asset_path: str) -> FileResponse:
    if asset_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")

    static_root = STATIC_DIR.resolve()
    asset = (static_root / asset_path).resolve()
    if asset.is_file() and asset.is_relative_to(static_root):
        return FileResponse(asset)
    return FileResponse(static_root / "index.html")

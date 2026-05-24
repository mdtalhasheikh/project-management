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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "project-management-api"}


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


class AIProbeResponse(BaseModel):
    question: str
    answer: str
    model: str


class ChatRequest(BaseModel):
    message: str
    history: list[ai_board.ChatHistoryMessage] = []


@app.get("/api/board")
def get_board() -> dict[str, Any]:
    return database.get_board()


@app.patch("/api/columns/{column_id}")
def rename_column(column_id: str, request: RenameColumnRequest) -> dict[str, Any]:
    try:
        return database.rename_column(column_id, request.name)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/api/cards")
def create_card(request: CreateCardRequest) -> dict[str, Any]:
    try:
        return database.create_card(request.columnId, request.title, request.details)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.patch("/api/cards/{card_id}")
def update_card(card_id: str, request: UpdateCardRequest) -> dict[str, Any]:
    try:
        return database.update_card(card_id, request.title, request.details)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.delete("/api/cards/{card_id}")
def delete_card(card_id: str) -> dict[str, Any]:
    try:
        return database.delete_card(card_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/api/cards/{card_id}/move")
def move_card(card_id: str, request: MoveCardRequest) -> dict[str, Any]:
    try:
        return database.move_card(card_id, request.targetColumnId)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


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


@app.post("/api/chat")
def chat_with_ai(request: ChatRequest) -> ai_board.ChatResponse:
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    board = database.get_board()
    messages = ai_board.build_chat_messages(request.message, request.history, board)
    try:
        raw_response = ai.OpenRouterClient().chat(
            messages,
            response_format={"type": "json_object"},
        )
        result = ai_board.parse_ai_chat_result(raw_response)
        return ai_board.apply_ai_chat_result(result, board)
    except ai.AIConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        logger.warning("AI chat response rejected: %s", error)
        raise HTTPException(status_code=502, detail=str(error)) from error
    except (httpx.HTTPError, RuntimeError) as error:
        logger.exception("OpenRouter chat request failed")
        raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {error}") from error


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

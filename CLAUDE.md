# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

This is a monorepo with two parts:

- `frontend/` — Next.js 16 static export (React 19, TypeScript, Tailwind CSS 4, `@dnd-kit`, `lucide-react`)
- `backend/` — Python FastAPI app (Python 3.12, `uv`, SQLite)

**Production**: Docker builds the frontend as a static export (`frontend/out/`) and copies it into the FastAPI image. FastAPI serves the static site at `/` and all API routes under `/api`. The full app runs at `http://localhost:8000`.

**Local frontend dev**: Run `npm run dev` in `frontend/` with webpack (Turbopack hung locally). Next.js proxies `/api/*` to `http://localhost:8000/api/*`, so the Docker backend must be running when using `http://localhost:3000`.

**Data**: SQLite at `data/project-management.db`, mounted via Docker volume. Ignored by git. Backend creates and seeds it automatically on startup.

## Running the App

```bash
# macOS
./scripts/start-mac.sh
./scripts/stop-mac.sh

# Linux
./scripts/start-linux.sh
./scripts/stop-linux.sh

# Windows PowerShell
.\scripts\start-windows.ps1
.\scripts\stop-windows.ps1
```

If Docker serves stale frontend assets, force a rebuild: `docker compose build --no-cache`.

## Backend Commands

```bash
cd backend

# Run tests (via Docker — matches CI)
docker run --rm -v "$PWD:/app" -w /app/backend ghcr.io/astral-sh/uv:python3.12-bookworm-slim uv run pytest

# Run a single test file
docker run --rm -v "$PWD:/app" -w /app/backend ghcr.io/astral-sh/uv:python3.12-bookworm-slim uv run pytest tests/test_main.py
```

## Frontend Commands

```bash
cd frontend

npm run dev          # dev server (webpack) at http://localhost:3000
npm run build        # static export to out/
npm run lint         # ESLint
npm run test         # Vitest unit tests (run once)
npm run test:watch   # Vitest watch mode
npm run test:e2e     # Playwright tests (serves out/ via http-server first)
```

Playwright tests mock board API responses and serve `frontend/out/`; run `npm run build` before `npm run test:e2e`. Don't run both simultaneously — Next.js allows only one build process at a time.

## Key Files

- `backend/src/project_management/main.py` — FastAPI app, route definitions, static file serving
- `backend/src/project_management/database.py` — SQLite init, seed, and all board data operations
- `backend/src/project_management/ai.py` — OpenRouter client
- `backend/src/project_management/ai_board.py` — AI chat endpoint logic, structured response parsing, board mutation via `database.py`
- `frontend/src/app/page.tsx` — Kanban page: board state, column/card UI, chat sidebar
- `frontend/src/lib/board.ts` — Board types and pure state helpers
- `frontend/src/lib/api.ts` — Frontend API client for backend board routes

## Database Schema

Normalized SQLite tables: `users`, `boards`, `columns`, `cards`. Columns and cards use integer `position` for ordering. `columns.slug` and `cards.slug` are the frontend-facing IDs. Full schema and seed data in `docs/DATABASE.md`.

## AI Chat

- Backend endpoint: `POST /api/chat` — receives user message + session history, appends current board JSON, calls OpenRouter, parses structured JSON response
- Supported AI board actions: `create_card`, `update_card`, `move_card`, `delete_card`
- All AI-requested mutations are validated before being applied through `database.py`
- Dev probe endpoint: `POST /api/dev/ai/ask-2-plus-2` (requires `PROJECT_MANAGEMENT_ENABLE_AI_DEV_ENDPOINT=true`)

## Environment Variables

```
OPENROUTER_API_KEY=...         # required for AI calls
OPENROUTER_MODEL=...           # defaults to openai/gpt-oss-120b
PROJECT_MANAGEMENT_ENABLE_AI_DEV_ENDPOINT=true  # enables dev probe endpoint
```

Copy `.env.example` to `.env` and fill in values.

## Auth

Login is frontend-only (credentials: `user` / `password`). No backend auth. The backend always operates as the hardcoded `user` account.

## Color Scheme

- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991`
- Dark Navy: `#032147`
- Gray Text: `#888888`

## Coding Standards

- Keep it simple — no over-engineering, no unnecessary defensive code, no extra features
- No emojis anywhere
- When hitting issues, identify the root cause before fixing — prove with evidence, then fix
- Backend mutations return the updated board so the frontend refreshes from the API response

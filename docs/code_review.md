# Code Review

Review date: 2026-05-24
Scope: Full project review (backend, frontend, infrastructure, tests)

---

## Backend (`backend/`)

### Strengths

- Clean module separation: `main.py` (routes), `database.py` (data layer), `ai.py` (OpenRouter client), `ai_board.py` (AI chat logic).
- Good use of `__future__ import annotations` for modern type hints.
- `contextlib.closing` used properly for SQLite connection management.
- Normalized SQLite schema with foreign keys, unique constraints, and proper ordering via integer `position` fields.
- Pydantic models with `extra="forbid"` to reject unexpected fields from AI output.
- Structured AI response parsing with discriminated union (`BoardAction`) for type-safe action handling.
- Path traversal protection in the catch-all static asset route.

### Issues

1. **`_ensure_schema` called on every request** (`database.py:88`, `database.py:99`, etc.)
   The schema initialization and seed check runs on nearly every API call. It should only run once in the `lifespan` handler. Currently `initialize_database()` is already called in `lifespan`, but each mutation function redundantly calls `_ensure_schema` again.

2. **Validation side-effect mutates shared state** (`ai_board.py:159`)
   `validate_actions` does `card_ids.remove(action.cardId)` for delete actions, mutating the local set. If the AI emits two delete actions for the same card ID, the second one raises a spurious `ValueError` ("unknown card") even though the card was valid and the first delete succeeded. The validation phase should not model the side-effects of execution.

3. **No transaction wrapping for AI action batches** (`ai_board.py:121-129`)
   AI actions are applied sequentially. If action N+1 fails, actions 1..N are already committed. There is no rollback. The entire batch should run inside a single transaction or be rejected atomically.

4. **Empty title silently returns current board** (`database.py:121-122`, `database.py:156-157`)
   `create_card` and `update_card` return the board unchanged when `clean_title` is empty. This masks bugs and differs from the API contract (no error, no indication of failure). Should raise a `ValueError` or similar.

5. **`get_database_path()` reads env var on every call** (`database.py:68-69`)
   The environment variable is read each time a connection is opened. This is fine for an MVP, but caching the path at startup would be cleaner and avoid potential race conditions if the env var changes.

6. **`_strip_json_fence` incomplete edge cases** (`ai_board.py:162-170`)
   Handles code fences (```json ... ```) at start/end but does not handle cases where the AI wraps the JSON in fences with trailing whitespace or newlines after the closing fence. The current `.strip()` calls help, but a regex-based approach would be more robust.

7. **Request models allow empty strings** (`main.py:47-55`)
   `CreateCardRequest.title` and `UpdateCardRequest.title` have no `min_length` validation. Empty strings pass Pydantic validation and are only caught in the database layer (silently). Adding Pydantic `min_length=1` would catch this earlier.

8. **`MoveCardRequest` has no target column validation** (`main.py:58-60`)
   No server-side validation that `targetColumnId` corresponds to a real column before the database layer tries to look it up. The `_get_column_row` call will raise `LookupError` on missing columns, so it works, but a pre-check would give a clearer error.

9. **Hardcoded `temperature: 0`** (`ai.py:57`)
   Fine for deterministic output, but should be configurable via settings for different use cases (e.g., creative suggestions vs. precise instructions).

10. **No dependency injection for database connections** (`database.py:86-89`)
    Functions like `get_board` create their own connection rather than accepting one. This makes it harder to test or to share a connection within a transaction. The current design is pragmatic for an MVP but limits future refactoring.

11. **Empty `backend/backend/` directory**
    There is an empty `backend/backend/` directory (not the `backend/backend/` src module, but a separate empty dir). This appears to be a leftover artifact and should be cleaned up.

12. **`app.get("/{asset_path:path}")` catch-all returns index.html for unknown paths** (`main.py:165-174`)
    Any unknown path (e.g., `/api/typo`) returns `index.html` instead of a 404. While the `api/` prefix is explicitly rejected, this could make debugging front-end routing issues harder.

---

## Frontend (`frontend/`)

### Strengths

- Clean component decomposition: `Home` (page), `LoginScreen`, `KanbanColumn`, `DraggableCard`, `CardPanel`, `ChatSidebar`.
- Good use of `useSyncExternalStore` for session state outside React lifecycle.
- Proper loading, empty, and error states for board loading and AI chat.
- Accessibility: `aria-label`, `sr-only` labels, `role="alert"` on errors, semantic HTML (`article`, `aside`, `section`).
- Drag and drop via `@dnd-kit` with proper activation constraints (`distance: 8`).

### Issues

1. **Render-time side effects for state synchronization** (`page.tsx:463-466`, `page.tsx:589-597`)
   `KanbanColumn` and `CardPanel` use render-time `if` checks to synchronize local state with props:
   ```tsx
   if (column.name !== syncedName) { setSyncedName(column.name); setName(column.name); }
   ```
   This is a React anti-pattern. Side effects during render can cause infinite loops in concurrent React. Should use `key` prop to force re-mount, or `useEffect` for synchronization.

2. **Missing `board.test.ts`**
   `frontend/AGENTS.md` mentions `src/lib/board.test.ts` with Vitest tests for `board.ts` helpers, but this file does not exist. The board state helpers (`renameColumn`, `addCard`, etc. from `board.ts`) are untested.

3. **`api.test.ts` only tests happy path** (`api.test.ts`)
   Tests verify that `fetch` is called with the correct arguments, but never test error handling (non-ok responses, network failures). The `requestJson` helper's error path is uncovered.

4. **No `useCallback` for child component handlers** (`page.tsx:110-136`)
   Functions like `handleAddCard`, `handleDragEnd`, `handleSendChat` are recreated on every render. When passed to `KanbanColumn`, `ChatSidebar`, etc., they cause unconditional re-renders. This is not a performance problem for an MVP but should be noted.

5. **Form state per column is re-initialized on every board load** (`page.tsx:71-76`)
   `applyBoard` rebuilds `forms` state from scratch using `Object.fromEntries`. If the user is mid-typing while the board refreshes (e.g., from an AI response), their draft is lost. The current approach preserves existing form values, so this is partially mitigated.

6. **Playwright tests rebuild frontend on every run** (`playwright.config.ts:12`)
   `webServer.command: "npm run build && npm run serve:static"` runs a full production build before tests. With `reuseExistingServer: true` this only affects the first run, but the first run is slow (~30s+). Consider a dev-server-based test approach for faster iteration.

7. **Board state is an array of columns, not a flat ID map** (`board.ts`)
   The frontend stores cards nested under columns. Lookups like finding a card by ID require iterating all columns (`page.tsx:104-106` uses `flatMap`). A flat map (e.g., `Map<string, Card>`) alongside the column array would be more efficient for lookups.

8. **No `aria-sort` or drag affordance announcements for screen readers**
   The drag handle has `aria-label="Drag {card title}"` which is good, but there is no live region announcing when a card is picked up, moved, or dropped. Screen reader users cannot effectively use drag-and-drop.

9. **AI chat history grows unbounded** (`page.tsx:153-163`)
   The entire `chatMessages` array is sent as `history` on every request. For long conversations, this consumes context window and bandwidth. Consider capping history to the last N messages.

10. **`sessionStorage` means session is lost on tab close** (`page.tsx:36-50`)
    Intended for MVP, but changing to `localStorage` with an explicit "log out" action would be a better UX. Current behavior is documented, so this is a design choice, not a bug.

---

## Infrastructure

### Strengths

- Two-stage Docker build: frontend built in Node image, copied into slim Python image.
- Cross-platform start/stop scripts for Mac, Linux, Windows.
- `.gitignore` properly excludes `data/`, `.env`, `node_modules`, build artifacts.
- Docker Compose uses `env_file` for secrets (not baked into the image).
- SQLite data persisted via Docker volume mount (`./data:/app/data`).

### Issues

1. **No `.dockerignore` file**
   Only `.gitignore` exists. Docker sends the entire project directory (including `node_modules/`, `backend/.venv/`, etc.) as build context. While the multi-stage build mitigates this, a `.dockerignore` would reduce context size and build time.

2. **No health check in Docker Compose** (`docker-compose.yml`)
   No `healthcheck` defined for the service. `docker compose up` returns before the app is ready. Scripts could benefit from a health check loop.

3. **`.env.example` model mismatch** (`.env.example:2`)
   `OPENROUTER_MODEL=google/gemini-2.0-flash-001` but `AGENTS.md` and `ai.py:9` document the default as `openai/gpt-oss-120b`. The example should match the documented default.

4. **`data/` directory not created on first run without Docker**
   The `database.py:74` handles this with `path.parent.mkdir()`, so it's handled in code. But the `data/` gitignore entry means developers must know this happens automatically.

---

## Testing

### Strengths

- Backend tests are well-isolated using `tmp_path` and `monkeypatch`.
- Comprehensive Playwright tests covering login, CRUD, drag-and-drop, AI chat, and logout.
- AI action validation is thoroughly tested (valid, invalid, mixed, no-op).
- Test for path traversal protection in static file serving.
- Test for AI dev endpoint disabled by default, missing API key, and configured model.

### Issues

1. **`test_static_asset_rejects_path_traversal` calls function directly** (`test_main.py:112-116`)
   Tests `main.static_asset()` directly instead of making an HTTP request via `TestClient`. This bypasses FastAPI's route resolution and exception handling. The logic is tested, but the full error path (HTTP 404 vs HTML fallback) is not.

2. **No integration test for full Docker stack**
   Backend and frontend tests run independently (pytest vs Playwright). No end-to-end test validates the complete Docker container serves both static assets and API routes correctly. Consider a simple smoke test that starts the container and hits `/` and `/api/health`.

3. **`test_database.py:26` mutations persist without initialization call**
   The test calls `database.rename_column(...)` without first calling `database.initialize_database()`. This works because `_ensure_schema` is called inside each mutation function. If that guard were removed (as recommended above), this test would break without an explicit init.

4. **No test for duplicate card positions after reorder**
   The `_compact_card_positions` function is called after delete and move, but there is no direct unit test for it. It is exercised indirectly through mutation tests.

---

## Documentation

- `docs/PLAN.md` is thorough and matches the actual implementation.
- `docs/DATABASE.md` accurately describes the schema, seed data, and API shape.
- `AGENTS.md` files in each directory provide good context for AI coding assistants.
- `CLAUDE.md` duplicates some content from `AGENTS.md` but serves as a quick reference.

### Minor Issues

- `frontend/AGENTS.md` mentions `board.test.ts` which does not exist (see above).
- `.env.example` model mismatch (see above).

---

## Summary

| Category | Score |
|---|---|
| Architecture | Good - clean separation, normalized schema |
| Code quality | Good - some React anti-patterns, solid backend |
| Test coverage | Good - 24 backend + 12 frontend unit + 8 e2e |
| Security | Good - no secrets committed, path traversal protection |
| Accessibility | Fair - aria labels present, drag-and-drop not accessible |
| MVP readiness | Ready - all planned features implemented |

# Code Review

Date: 2026-05-24
Scope: entire repository (backend FastAPI, frontend Next.js, Docker, scripts, git hygiene).
Test status at review time: backend 24 passed, frontend 12 unit + 8 e2e passed, lint clean, build passes.

The app is functionally complete and the code is generally clean: parameterized SQL throughout, a well-isolated AI validation layer, typed Pydantic contracts with `extra="forbid"`, correct position-compaction logic, good secret hygiene, and solid accessibility. The findings below are ordered by severity, each with a concrete action.

---

## Critical

### C1. `frontend/` is a broken git submodule — frontend source is NOT in the repository

The parent repo records `frontend` as a gitlink (mode `160000`, commit `f4767d9b...`), but:

- there is no `.gitmodules` file (`git submodule status` -> "no submodule mapping found"),
- there is no `frontend/.git`, and
- no frontend source is tracked in the parent (`git log --all -- frontend/src/app/page.tsx` returns nothing).

`git status` still reports "clean" because git cannot descend into the missing submodule.

**Impact:** a fresh `git clone` of this repo gets an empty `frontend/` (just a dangling commit pointer with no URL to fetch it from). The Docker build would then fail — the `frontend-builder` stage runs `npm run build` against an empty directory. The entire frontend currently exists only on this machine and is one `rm -rf` away from being lost. This almost certainly happened when `git add frontend` ran while `frontend/` had its own nested `.git`, which was later removed.

**Action:**
1. Back up the working `frontend/` directory first.
2. Remove the gitlink from the index: `git rm --cached frontend`
3. Ensure `frontend/.git` does not exist (it does not), then re-add the real files: `git add frontend`
4. Confirm real files are now tracked: `git ls-files frontend | head` should list `frontend/src/...`, not a single `frontend` entry.
5. Commit. Verify by cloning to a temp dir (or `git archive`) that the frontend source is present.

---

## High

### H1. Card edits and column renames issue an API write on every keystroke

In `frontend/src/app/page.tsx`:
- column rename: `onChange={(event) => onRename(event.target.value)}` (line 453) -> `runBoardMutation(renameColumn ...)`
- card title/details edit: `onChange` handlers at lines 576-578 and 588-590 -> `runBoardMutation(updateCard ...)`

Every keystroke fires a PATCH, and each response runs `applyBoard`, replacing the entire `columns` state. Consequences:
- a write to SQLite per character typed (write amplification),
- the controlled input value is sourced from board state that gets replaced mid-typing, causing cursor jumps,
- responses can resolve out of order, dropping characters (a race / lost-update bug).

**Action:** hold the field value in local component state while editing and persist once on `blur` (or debounce, e.g. 400ms). Only call the API with the final value. This removes the race and the per-keystroke writes.

### H2. Path traversal in the static catch-all route

`backend/src/project_management/main.py:159-167`:

```python
asset = STATIC_DIR / asset_path
if asset.is_file():
    return FileResponse(asset)
```

`asset_path` comes from `/{asset_path:path}` and is not constrained. A request such as `..%2f..%2f..%2fetc/passwd` resolves outside `STATIC_DIR`, and `FileResponse` would serve an arbitrary file readable by the process. The `/_next` mount uses Starlette `StaticFiles` (which is safe), but this hand-rolled handler is not.

Severity is lowered by the app being explicitly local/single-user, but the fix is cheap.

**Action:** resolve and verify containment before serving:

```python
asset = (STATIC_DIR / asset_path).resolve()
if asset.is_file() and asset.is_relative_to(STATIC_DIR.resolve()):
    return FileResponse(asset)
return FileResponse(STATIC_DIR / "index.html")
```

Add a backend test that a traversal path does not return out-of-tree files.

---

## Medium

### M1. SQLite connections are never closed

`backend/src/project_management/database.py` uses `with connect(...) as connection:` everywhere. For `sqlite3`, the connection context manager commits/rolls back the transaction but does **not** close the connection — connections leak for the life of the process.

**Action:** wrap with `contextlib.closing`, e.g. `with closing(connect(...)) as connection, connection:` (closing handles `close()`, the inner `connection` handles the transaction), or add an explicit `try/finally: connection.close()`.

### M2. Redundant DB initialization and double connections per request

Every data function calls `initialize_database()` first (which opens a connection and runs all `CREATE TABLE IF NOT EXISTS` + a user-exists check), then opens a second connection for the actual work, and mutations then call `get_board()` which calls `initialize_database()` a **third** time and opens yet another connection. The schema is already created once at startup via the `lifespan` hook (`main.py:23-26`).

**Action:** drop the per-call `initialize_database()` calls and rely on the startup `lifespan` initialization (keep one guarded init for the "DB file missing" case if desired). This removes several connection open/close cycles and schema re-runs per request.

### M3. Dead code: `board.ts` helpers and `initialBoard` are unused by the app

`frontend/src/lib/board.ts` exports `initialBoard` and pure helpers `renameColumn`, `addCard`, `updateCard`, `deleteCard`, `moveCard`. The live UI (`page.tsx`) uses the API client in `lib/api.ts` instead; only `board.test.ts` exercises these helpers. So the 12 unit tests validate logic the application never runs. This conflicts with the project's "no extra features / keep it simple" standard.

**Action:** delete the unused helpers and `initialBoard` (keep the `Card` and `BoardColumn` types, which are used), and remove `board.test.ts`. If you prefer to keep client-side board logic for future offline use, document why; otherwise remove it.

### M4. `.gitignore` ignores `AGENTS.md` (and stray artifacts)

`.gitignore` line 23 ignores `AGENTS.md`. The already-committed ones (root, `backend/`, `scripts/`) survive, but any new or moved `AGENTS.md` will be silently untracked, and `frontend/AGENTS.md` / `frontend/CLAUDE.md` are unreachable (also a consequence of C1). Lines 16 and 22 (`Profile-2.pdf`, `Review.md`) look like leftover personal artifacts.

**Action:** remove `AGENTS.md` from `.gitignore` so the project spec stays version-controlled. Review whether `Profile-2.pdf` / `Review.md` ignores are still needed.

---

## Low / Nits

### L1. `update_card` does not strip or validate the title
`database.py:208-228` writes title/details verbatim, unlike `create_card` (`:181-184`) which strips and rejects an empty title. Combined with H1, clearing a card title persists an empty string. Action: strip and ignore/validate empty title for consistency.

### L2. Sign-in state is not persisted
`page.tsx:37` keeps `isSignedIn` in `useState`, so a browser refresh logs the user out. The plan permitted browser storage. Minor UX; e2e tests must re-login after each reload. Action (optional): persist a flag in `sessionStorage`.

### L3. Within-column reordering is unsupported
Both the frontend (`board.ts:141` / drag handling) and backend (`database.py:247` `move_card`) only append a moved card to the end of the target column; dropping a card back on its own column is a no-op. This matches the MVP scope. Action: document it as a known limitation so it is not mistaken for a bug.

### L4. Generic client error messages
`api.ts:29-31` throws a single `"API request failed"` regardless of status, discarding the backend `detail`. Fine for the MVP; worth surfacing detail if debugging gets harder.

---

## Positive notes (keep these)

- All SQL is parameterized — no injection surface in the data layer.
- AI output is parsed and fully validated against the current board before any mutation; invalid output is rejected without touching the DB (`ai_board.py:113-155`).
- Pydantic models use `extra="forbid"` and a discriminated union for actions — a tight contract.
- Position compaction assigns ascending positions in ascending order, so it never collides with the `UNIQUE(column_id, position)` constraint.
- Secret hygiene is good: `.env` is gitignored, `.env.example` is provided, and the API key only ever appears in request headers.
- Accessibility is solid: labelled inputs, `role="alert"` on errors, aria labels on drag/delete controls.

---

## Action checklist

All items below were addressed on 2026-05-24. Verified: backend 25 pytest, frontend lint clean, 5 Vitest, 8 Playwright.

- [x] C1: Removed the broken gitlink (`git rm --cached frontend`) and re-added the real frontend source; `git ls-files frontend` now lists the actual files.
- [x] H1: Card title/details and column rename use local state and persist on blur (no more per-keystroke writes). E2e tests updated to blur + await the PATCH.
- [x] H2: Static catch-all now resolves the path and checks `is_relative_to(STATIC_DIR)`; added `test_static_asset_rejects_path_traversal`.
- [x] M1: All DB connections wrapped in `contextlib.closing`.
- [x] M2: Each public DB function now uses a single connection and serializes the board from it (no nested `get_board()` re-init); schema ensured once per connection.
- [x] M3: Removed the unused `board.ts` helpers and deleted `board.test.ts`. Kept `initialBoard` (used by the Playwright mock) and the shared types.
- [x] M4: Removed `AGENTS.md` (and the dead `Review.md`) from `.gitignore`; `frontend/AGENTS.md` is now tracked.
- [x] L1: `update_card` strips title/details and ignores an empty title (consistent with `create_card`).
- [x] L2: Sign-in persists across reloads via `useSyncExternalStore` over `sessionStorage` (hydration-safe).
- [x] L3: Documented the no-within-column-reorder limitation in `docs/DATABASE.md`.

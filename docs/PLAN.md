# Project Plan

Work through each part in order. After each part is implemented and tested, pause for user approval before starting the next part.

## Current Implementation Decisions

- The production app runs as one Dockerized FastAPI service on `http://localhost:8000`.
- The Next.js frontend is built as a static export during Docker builds and copied into the FastAPI image. FastAPI serves the exported frontend at `/` and keeps API routes under `/api`.
- Local frontend development uses `npm run dev` with webpack because Turbopack dev hung locally on `Compiling /`. In dev mode, Next proxies `/api/*` to `http://localhost:8000/api/*`, so the Docker backend must be running when testing the frontend at `http://localhost:3000`.
- Playwright tests serve the static `frontend/out` build with `http-server` and mock board API responses where needed. Docker/browser smoke tests cover the real frontend and backend together.
- Dummy login remains frontend-only React state. Credentials are `user` and `password`; no backend auth has been added yet.
- SQLite data is stored in `data/project-management.db`, mounted into Docker with `./data:/app/data`, and ignored by git.
- The database schema is normalized across `users`, `boards`, `columns`, and `cards`; details are documented in `docs/DATABASE.md`.
- Backend board mutations return the updated board so the frontend can refresh state from the API response after each change.
- OpenRouter configuration comes from environment variables. `OPENROUTER_API_KEY` is required for real AI calls, `OPENROUTER_MODEL` defaults to `openai/gpt-oss-120b`, and `OPENROUTER_BASE_URL` defaults to `https://openrouter.ai/api/v1`.
- The development AI probe endpoint is `POST /api/dev/ai/ask-2-plus-2` and is disabled unless `PROJECT_MANAGEMENT_ENABLE_AI_DEV_ENDPOINT=true`.
- The production AI chat endpoint is `POST /api/chat`. It receives the user message and session chat history, adds current board JSON on the backend, and asks OpenRouter for a JSON object response.
- AI chat uses a structured JSON response contract with a user-facing message and optional card actions. The backend validates all AI-requested actions before applying them through the existing board data layer.
- AI-supported board actions are `create_card`, `update_card`, `move_card`, and `delete_card`. Invalid AI output returns an error and does not mutate the board.
- The frontend chat sidebar keeps conversation history in the current browser session and refreshes the board when the backend reports an AI-driven board change.
- Frontend lint ignores generated Playwright output folders (`test-results/` and `playwright-report/`) so missing generated folders do not break ESLint.
- If Docker appears to serve stale frontend assets during local testing, force a rebuild with `docker compose build --no-cache` before starting the app again.

## Latest Verification

Last verified: 2026-05-24.

- [x] Backend tests: `docker run --rm -v "$PWD:/app" -w /app/backend ghcr.io/astral-sh/uv:python3.12-bookworm-slim uv run pytest` passed with 24 tests.
- [x] Frontend unit tests: `npm run test` passed with 12 tests.
- [x] Frontend lint: `npm run lint` passed.
- [x] Frontend production build: `npm run build` passed.
- [x] Frontend Playwright tests: `npm run test:e2e` passed with 8 tests. If run at the same time as `npm run build`, rerun it after the build finishes because Next allows only one build process at a time.
- [x] Docker image build: `docker compose build app` passed.

## Part 1: Planning and Frontend Notes

Goal: turn the high-level project outline into an executable plan and document the existing frontend.

Checklist:
- [x] Expand this plan with detailed substeps, tests, and success criteria for each part.
- [x] Fix typos and clarify ambiguous implementation choices.
- [x] Create or update `frontend/AGENTS.md` with a concise description of the current frontend structure, dependencies, and test commands.
- [x] Ask the user to review and approve the plan before Part 2 begins.

Tests:
- [x] Review `docs/PLAN.md` for spelling, clarity, and consistency with `AGENTS.md`.
- [x] Review `frontend/AGENTS.md` against the actual frontend files.

Success criteria:
- [x] The plan clearly states that the Kanban database will use normalized SQLite tables.
- [x] The plan clearly states that dummy login remains frontend-only until backend persistence is introduced.
- [x] The user approves the plan.

## Part 2: Scaffolding

Goal: add the Docker, FastAPI backend, and cross-platform start/stop scripts needed to run a local full-stack app.

Checklist:
- [x] Create `backend/` with a minimal FastAPI app.
- [x] Add a health endpoint, for example `GET /api/health`.
- [x] Serve a simple static HTML page from `/` to prove FastAPI can serve frontend assets.
- [x] Add Python project files using `uv`.
- [x] Add a Dockerfile that installs backend dependencies and runs the FastAPI app.
- [x] Add Docker Compose or an equivalent simple local container command if it keeps startup simpler.
- [x] Add start and stop scripts for macOS, Linux, and Windows in `scripts/`.
- [x] Document the local startup command briefly in the README if needed.

Tests:
- [x] Backend unit test confirms `GET /api/health` returns success.
- [x] Local smoke test confirms `/` serves the example HTML.
- [x] Local smoke test confirms the example API call works through the running container.
- [x] Run the relevant backend test command.

Success criteria:
- [x] A user can start the app locally through the script for their OS.
- [x] The running container serves both `/` and `/api/health`.
- [x] The stop script cleanly stops the local container.

## Part 3: Serve the Existing Frontend

Goal: build the existing Next.js Kanban demo as static assets and serve it from the FastAPI app at `/`.

Checklist:
- [x] Configure the frontend for static export if required by the installed Next.js version.
- [x] Update the Docker build so the frontend is built and copied into the backend image.
- [x] Update FastAPI static serving so `/` displays the Kanban board.
- [x] Keep existing Kanban behavior: fixed columns, editable column names, add/edit/delete cards, and drag-and-drop movement.
- [x] Keep the frontend color scheme aligned with `AGENTS.md`.

Tests:
- [x] Run frontend unit tests.
- [x] Run frontend Playwright integration tests.
- [x] Run backend/static-serving smoke tests.
- [x] Build the Docker image successfully.

Success criteria:
- [x] The local container displays the demo Kanban board at `/`.
- [x] Existing frontend tests pass.
- [x] Static serving does not require a separate Next.js server at runtime.

## Part 4: Frontend-Only Dummy Sign In

Goal: require a simple local login before showing the Kanban board.

Checklist:
- [x] Add a login screen shown first at `/`.
- [x] Accept only username `user` and password `password`.
- [x] Store the signed-in state in simple frontend state or browser storage.
- [x] Add a logout control that returns the user to the login screen.
- [x] Keep this auth implementation frontend-only until backend persistence is introduced.
- [x] Avoid adding roles, registration, password reset, or other non-MVP auth features.

Tests:
- [x] Unit test login state helpers if introduced.
- [x] Playwright test confirms the board is hidden before login.
- [x] Playwright test confirms valid credentials reveal the board.
- [x] Playwright test confirms invalid credentials show a clear error.
- [x] Playwright test confirms logout hides the board.

Success criteria:
- [x] Visiting `/` requires dummy login before the board is visible.
- [x] Login and logout work locally without backend auth.
- [x] Existing Kanban interactions still work after login.

## Part 5: Database Modeling

Goal: design the normalized SQLite schema for persisted users and Kanban boards, then get user approval before implementation.

Checklist:
- [x] Create a database design document in `docs/`.
- [x] Model users, boards, columns, cards, and ordering with normalized SQLite tables.
- [x] Support multiple users in the schema, while keeping one board per signed-in user for the MVP.
- [x] Include creation and update timestamps where useful.
- [x] Define seed data for the default user and initial board.
- [x] Define migration or initialization behavior for creating a missing database.
- [x] Ask the user to approve the schema before Part 6 begins.

Tests:
- [x] Review the schema against current Kanban data needs.
- [x] Confirm the schema supports renaming columns, editing cards, deleting cards, and moving cards between columns.
- [x] Confirm the schema supports future multiple users without changing the MVP UI.

Success criteria:
- [x] The schema is documented and normalized.
- [x] The schema avoids storing the board as one opaque JSON blob.
- [x] The user approves the database approach.

## Part 6: Backend Persistence API

Goal: implement FastAPI routes that read and update the Kanban board for a user using SQLite.

Checklist:
- [x] Add SQLite connection and database initialization code.
- [x] Create the database if it does not exist.
- [x] Seed the default `user` account and initial board when needed.
- [x] Add API routes to fetch the current user's board.
- [x] Add API routes to rename columns.
- [x] Add API routes to create, update, delete, and move cards.
- [x] Keep the backend API small and focused on the MVP interactions.
- [x] Use the hardcoded MVP user until backend auth is introduced.

Tests:
- [x] Unit test database initialization and seed behavior.
- [x] Unit test each board mutation at the data layer.
- [x] FastAPI route tests cover fetch, rename, create, update, delete, and move.
- [x] Test that a missing database is created automatically.

Success criteria:
- [x] Backend tests pass.
- [x] API routes persist changes in SQLite.
- [x] Restarting the backend does not lose board changes.

## Part 7: Connect Frontend to Backend

Goal: make the Kanban board use the backend API so board changes persist.

Checklist:
- [x] Add a small frontend API client for board operations.
- [x] Load the board from the backend after dummy login.
- [x] Replace local-only board mutations with API-backed operations.
- [x] Update frontend state from API responses.
- [x] Handle simple loading and error states.
- [x] Keep the UI behavior close to the existing demo.

Tests:
- [x] Frontend unit tests for API client or state helpers where useful.
- [x] Playwright test confirms board data loads from the backend.
- [x] Playwright test confirms column rename persists after reload.
- [x] Playwright test confirms card create, edit, delete, and move persist after reload.
- [x] Backend tests from Part 6 still pass.

Success criteria:
- [x] The app is a persistent Kanban board.
- [x] Refreshing the browser keeps board changes.
- [x] The local Docker app runs frontend and backend together.

## Part 8: AI Connectivity

Goal: prove the backend can call OpenRouter using the configured model.

Checklist:
- [x] Add backend configuration for `OPENROUTER_API_KEY`.
- [x] Use OpenRouter with model `openai/gpt-oss-120b`.
- [x] Add a minimal backend AI client.
- [x] Add a development-only or test endpoint/command that asks the model a simple `2+2` question.
- [x] Keep secrets out of source control.

Tests:
- [x] Unit test AI client behavior with mocked OpenRouter responses.
- [x] Manual smoke test confirms a real `2+2` call works when `OPENROUTER_API_KEY` is set.
- [x] Test that missing API key produces a clear backend error.

Success criteria:
- [x] The backend can make a real OpenRouter call locally.
- [x] The real-call test is documented but does not run automatically without credentials.
- [x] No API keys are committed.

## Part 9: AI Board Update Contract

Goal: send the board JSON, user question, and chat history to the AI, then receive structured output that may update the Kanban board.

Checklist:
- [x] Define the structured AI response schema.
- [x] Include a user-facing chat response in every AI result.
- [x] Allow optional Kanban updates for creating, editing, moving, or deleting one or more cards.
- [x] Include current board state and conversation history in the AI prompt.
- [x] Validate AI output before applying changes.
- [x] Apply valid AI-requested board changes through the same backend data layer used by the API.
- [x] Return the updated board when changes are applied.

Tests:
- [x] Unit test structured output parsing and validation.
- [x] Unit test each AI-supported board mutation using mocked AI responses.
- [x] Route tests cover chat responses with no board update.
- [x] Route tests cover chat responses with one or more board updates.
- [x] Test invalid AI output is rejected without corrupting the board.

Success criteria:
- [x] The backend can safely process AI chat responses.
- [x] AI-driven board updates persist in SQLite.
- [x] The backend response tells the frontend whether the board changed.

## Part 10: AI Chat Sidebar

Goal: add a polished sidebar chat UI that lets the user ask the AI to work with the Kanban board.

Checklist:
- [x] Add a sidebar chat widget to the Kanban page.
- [x] Show conversation history for the current session.
- [x] Send user messages to the backend AI endpoint.
- [x] Render assistant responses clearly.
- [x] Show loading and error states.
- [x] Refresh the board automatically when the AI updates it.
- [x] Keep the layout responsive and aligned with the project color scheme.

Tests:
- [x] Frontend tests cover chat rendering and message submission.
- [x] Playwright test covers a mocked AI response with no board update.
- [x] Playwright test covers a mocked AI response that updates the board and refreshes the UI.
- [x] Backend AI route tests from Part 9 still pass.

Success criteria:
- [x] The user can chat with the AI from the sidebar.
- [x] The AI can create, edit, move, or delete cards through structured backend updates.
- [x] The UI refreshes automatically when the board changes.
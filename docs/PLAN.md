# Project Plan

Work through each part in order. After each part is implemented and tested, pause for user approval before starting the next part.

## Part 1: Planning and Frontend Notes

Goal: turn the high-level project outline into an executable plan and document the existing frontend.

Checklist:
- [x] Expand this plan with detailed substeps, tests, and success criteria for each part.
- [x] Fix typos and clarify ambiguous implementation choices.
- [x] Create or update `frontend/AGENTS.md` with a concise description of the current frontend structure, dependencies, and test commands.
- [ ] Ask the user to review and approve the plan before Part 2 begins.

Tests:
- [x] Review `docs/PLAN.md` for spelling, clarity, and consistency with `AGENTS.md`.
- [x] Review `frontend/AGENTS.md` against the actual frontend files.

Success criteria:
- [x] The plan clearly states that the Kanban database will use normalized SQLite tables.
- [x] The plan clearly states that dummy login remains frontend-only until backend persistence is introduced.
- [ ] The user approves the plan.

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
- [ ] Ask the user to approve the schema before Part 6 begins.

Tests:
- [x] Review the schema against current Kanban data needs.
- [x] Confirm the schema supports renaming columns, editing cards, deleting cards, and moving cards between columns.
- [x] Confirm the schema supports future multiple users without changing the MVP UI.

Success criteria:
- [x] The schema is documented and normalized.
- [x] The schema avoids storing the board as one opaque JSON blob.
- [ ] The user approves the database approach.

## Part 6: Backend Persistence API

Goal: implement FastAPI routes that read and update the Kanban board for a user using SQLite.

Checklist:
- [ ] Add SQLite connection and database initialization code.
- [ ] Create the database if it does not exist.
- [ ] Seed the default `user` account and initial board when needed.
- [ ] Add API routes to fetch the current user's board.
- [ ] Add API routes to rename columns.
- [ ] Add API routes to create, update, delete, and move cards.
- [ ] Keep the backend API small and focused on the MVP interactions.
- [ ] Use the hardcoded MVP user until backend auth is introduced.

Tests:
- [ ] Unit test database initialization and seed behavior.
- [ ] Unit test each board mutation at the data layer.
- [ ] FastAPI route tests cover fetch, rename, create, update, delete, and move.
- [ ] Test that a missing database is created automatically.

Success criteria:
- [ ] Backend tests pass.
- [ ] API routes persist changes in SQLite.
- [ ] Restarting the backend does not lose board changes.

## Part 7: Connect Frontend to Backend

Goal: make the Kanban board use the backend API so board changes persist.

Checklist:
- [ ] Add a small frontend API client for board operations.
- [ ] Load the board from the backend after dummy login.
- [ ] Replace local-only board mutations with API-backed operations.
- [ ] Update frontend state from API responses.
- [ ] Handle simple loading and error states.
- [ ] Keep the UI behavior close to the existing demo.

Tests:
- [ ] Frontend unit tests for API client or state helpers where useful.
- [ ] Playwright test confirms board data loads from the backend.
- [ ] Playwright test confirms column rename persists after reload.
- [ ] Playwright test confirms card create, edit, delete, and move persist after reload.
- [ ] Backend tests from Part 6 still pass.

Success criteria:
- [ ] The app is a persistent Kanban board.
- [ ] Refreshing the browser keeps board changes.
- [ ] The local Docker app runs frontend and backend together.

## Part 8: AI Connectivity

Goal: prove the backend can call OpenRouter using the configured model.

Checklist:
- [ ] Add backend configuration for `OPENROUTER_API_KEY`.
- [ ] Use OpenRouter with model `openai/gpt-oss-120b`.
- [ ] Add a minimal backend AI client.
- [ ] Add a development-only or test endpoint/command that asks the model a simple `2+2` question.
- [ ] Keep secrets out of source control.

Tests:
- [ ] Unit test AI client behavior with mocked OpenRouter responses.
- [ ] Manual smoke test confirms a real `2+2` call works when `OPENROUTER_API_KEY` is set.
- [ ] Test that missing API key produces a clear backend error.

Success criteria:
- [ ] The backend can make a real OpenRouter call locally.
- [ ] The real-call test is documented but does not run automatically without credentials.
- [ ] No API keys are committed.

## Part 9: AI Board Update Contract

Goal: send the board JSON, user question, and chat history to the AI, then receive structured output that may update the Kanban board.

Checklist:
- [ ] Define the structured AI response schema.
- [ ] Include a user-facing chat response in every AI result.
- [ ] Allow optional Kanban updates for creating, editing, moving, or deleting one or more cards.
- [ ] Include current board state and conversation history in the AI prompt.
- [ ] Validate AI output before applying changes.
- [ ] Apply valid AI-requested board changes through the same backend data layer used by the API.
- [ ] Return the updated board when changes are applied.

Tests:
- [ ] Unit test structured output parsing and validation.
- [ ] Unit test each AI-supported board mutation using mocked AI responses.
- [ ] Route tests cover chat responses with no board update.
- [ ] Route tests cover chat responses with one or more board updates.
- [ ] Test invalid AI output is rejected without corrupting the board.

Success criteria:
- [ ] The backend can safely process AI chat responses.
- [ ] AI-driven board updates persist in SQLite.
- [ ] The backend response tells the frontend whether the board changed.

## Part 10: AI Chat Sidebar

Goal: add a polished sidebar chat UI that lets the user ask the AI to work with the Kanban board.

Checklist:
- [ ] Add a sidebar chat widget to the Kanban page.
- [ ] Show conversation history for the current session.
- [ ] Send user messages to the backend AI endpoint.
- [ ] Render assistant responses clearly.
- [ ] Show loading and error states.
- [ ] Refresh the board automatically when the AI updates it.
- [ ] Keep the layout responsive and aligned with the project color scheme.

Tests:
- [ ] Frontend tests cover chat rendering and message submission.
- [ ] Playwright test covers a mocked AI response with no board update.
- [ ] Playwright test covers a mocked AI response that updates the board and refreshes the UI.
- [ ] Backend AI route tests from Part 9 still pass.

Success criteria:
- [ ] The user can chat with the AI from the sidebar.
- [ ] The AI can create, edit, move, or delete cards through structured backend updates.
- [ ] The UI refreshes automatically when the board changes.
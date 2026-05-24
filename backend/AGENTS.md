# Backend Notes

This backend is a FastAPI app managed with `uv`.

## Current Structure

- `src/project_management/main.py` defines the FastAPI app, `GET /api/health`, and static serving for the scaffold page at `/`.
- `static/index.html` is the temporary hello-world page used by Part 2.
- `tests/test_main.py` covers the health endpoint and static page.
- `pyproject.toml` defines runtime and test dependencies.

## Commands

- `uv run pytest` runs backend tests from this directory.
- `uv run uvicorn project_management.main:app --host 0.0.0.0 --port 8000` starts the backend locally.
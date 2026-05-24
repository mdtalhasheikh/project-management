FROM node:24-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/backend/src

COPY backend/pyproject.toml backend/uv.lock /app/backend/
COPY backend/src /app/backend/src
COPY backend/static /app/backend/static
COPY --from=frontend-builder /app/frontend/out /app/frontend/out

WORKDIR /app/backend

RUN uv sync --no-dev

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "project_management.main:app", "--host", "0.0.0.0", "--port", "8000"]

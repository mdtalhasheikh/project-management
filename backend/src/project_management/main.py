from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
FRONTEND_OUT_DIR = PROJECT_ROOT / "frontend" / "out"
FALLBACK_STATIC_DIR = BACKEND_DIR / "static"
STATIC_DIR = FRONTEND_OUT_DIR if FRONTEND_OUT_DIR.exists() else FALLBACK_STATIC_DIR

app = FastAPI(title="Project Management API")

if (STATIC_DIR / "_next").exists():
    app.mount("/_next", StaticFiles(directory=STATIC_DIR / "_next"), name="next_static")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "project-management-api"}


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/{asset_path:path}", include_in_schema=False)
def static_asset(asset_path: str) -> FileResponse:
    asset = STATIC_DIR / asset_path
    if asset.is_file():
        return FileResponse(asset)
    return FileResponse(STATIC_DIR / "index.html")

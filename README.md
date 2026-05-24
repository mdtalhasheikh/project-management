# Project Management MVP

Local Dockerized Project Management app.

## Run

macOS:

```bash
./scripts/start-mac.sh
./scripts/stop-mac.sh
```

Linux:

```bash
./scripts/start-linux.sh
./scripts/stop-linux.sh
```

Windows PowerShell:

```powershell
.\scripts\start-windows.ps1
.\scripts\stop-windows.ps1
```

The app runs at `http://localhost:8000`.

## AI Smoke Test

Set `OPENROUTER_API_KEY` in `.env`. The default model is `openai/gpt-oss-120b`; override it with `OPENROUTER_MODEL` if needed.

To enable the development-only probe endpoint, set `PROJECT_MANAGEMENT_ENABLE_AI_DEV_ENDPOINT=true`, start the app, then run:

```bash
curl -X POST http://localhost:8000/api/dev/ai/ask-2-plus-2
```

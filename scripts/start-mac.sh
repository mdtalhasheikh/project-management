#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
docker compose up --build -d
echo "Project Management MVP is running at http://localhost:8000"

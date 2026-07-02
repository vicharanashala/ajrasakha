#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

VENV="${VENV:-$ROOT/.venv}"
PYTHON="${PYTHON:-python3}"

if [[ ! -d "$VENV" ]]; then
  "$PYTHON" -m venv "$VENV"
fi
# shellcheck source=/dev/null
source "$VENV/bin/activate"

STAMP="$VENV/.requirements-installed"
if [[ ! -f "$STAMP" ]] || [[ "$ROOT/requirements.txt" -nt "$STAMP" ]]; then
  pip install -r "$ROOT/requirements.txt"
  touch "$STAMP"
fi

mkdir -p "$ROOT/data"

API_HOST="${POP_API_HOST:-0.0.0.0}"
API_PORT="${POP_API_PORT:-9003}"
MCP_HOST="${POP_MCP_HOST:-0.0.0.0}"
MCP_PORT="${POP_MCP_PORT:-9002}"
export POP_MCP_PATH="${POP_MCP_PATH:-/mcp}"

cleanup() {
  [[ -n "${UVICORN_PID:-}" ]] && kill "$UVICORN_PID" 2>/dev/null || true
  [[ -n "${MCP_PID:-}" ]] && kill "$MCP_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting FastAPI on ${API_HOST}:${API_PORT} (uvicorn api_app:app)"
uvicorn api_app:app --host "$API_HOST" --port "$API_PORT" &
UVICORN_PID=$!

echo "Starting FastMCP streamable-http on ${MCP_HOST}:${MCP_PORT} (python mcp_app.py)"
python "$ROOT/mcp_app.py" &
MCP_PID=$!

wait

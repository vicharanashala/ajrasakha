#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi

# shellcheck source=/dev/null
source .venv/bin/activate

pip install -q -r requirements.txt

API_HOST="${IMD_API_HOST:-0.0.0.0}"
API_PORT="${IMD_API_PORT:-9004}"
MCP_HOST="${IMD_MCP_HOST:-0.0.0.0}"
MCP_PORT="${IMD_MCP_PORT:-9005}"
export IMD_MCP_PATH="${IMD_MCP_PATH:-/mcp}"

cleanup() {
  [[ -n "${UVICORN_PID:-}" ]] && kill "$UVICORN_PID" 2>/dev/null || true
  [[ -n "${MCP_PID:-}" ]] && kill "$MCP_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting FastAPI on ${API_HOST}:${API_PORT} (uvicorn api_app:app)"
uvicorn api_app:app --host "$API_HOST" --port "$API_PORT" &
UVICORN_PID=$!

echo "Starting FastMCP streamable-http on ${MCP_HOST}:${MCP_PORT} (python mcp_app.py)"
python mcp_app.py &
MCP_PID=$!

wait

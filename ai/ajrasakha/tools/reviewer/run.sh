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

AI_ROOT="$(cd "$ROOT/../../.." && pwd)"
if [[ -f "$AI_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$AI_ROOT/.env"
  set +a
fi

VENV="${VENV:-$ROOT/.venv}"
PYTHON="${PYTHON:-python3}"

if [[ ! -d "$VENV" ]]; then
  echo "Creating virtual environment at $VENV"
  "$PYTHON" -m venv "$VENV"
fi
# shellcheck source=/dev/null
source "$VENV/bin/activate"

STAMP="$VENV/.requirements-installed"
if [[ ! -f "$STAMP" ]] || [[ "$ROOT/requirements.txt" -nt "$STAMP" ]]; then
  pip install -r "$ROOT/requirements.txt"
  touch "$STAMP"
fi

REVIEWER_MCP_HOST="${REVIEWER_MCP_HOST:-0.0.0.0}"
REVIEWER_MCP_PORT="${REVIEWER_MCP_PORT:-9007}"
REVIEWER_MCP_PATH="${REVIEWER_MCP_PATH:-/mcp}"
export REVIEWER_MCP_HOST REVIEWER_MCP_PORT REVIEWER_MCP_PATH

if [[ -z "${INTERNAL_API_KEY:-}" ]]; then
  echo "Warning: INTERNAL_API_KEY is not set. Desk API calls will fail authentication."
fi

echo "Reviewer MCP -> http://${REVIEWER_MCP_HOST}:${REVIEWER_MCP_PORT}${REVIEWER_MCP_PATH}"
echo "Tool upload_question_to_reviewer_system requires a source arg (any non-empty string)"

exec python "$ROOT/reviewer_system_tool.py"

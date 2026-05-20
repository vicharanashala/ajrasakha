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

if [[ -z "${MONGO_URI:-}" && -f "$ROOT/../.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/../.env"
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

PROXY_HOST="${PROXY_HOST:-0.0.0.0}"
PROXY_PORT="${PROXY_PORT:-8001}"

echo "LangGraph OpenAI adapter -> ${LANGGRAPH_BASE_URL:-http://127.0.0.1:2024}"
echo "Assistant: ${LANGGRAPH_ASSISTANT_ID:-ajrasakha_agent}"
if [[ -n "${MONGO_URI:-}" ]]; then
  echo "MongoDB user location lookup: enabled"
else
  echo "MongoDB user location lookup: disabled (set MONGO_URI)"
fi
echo "Listening on ${PROXY_HOST}:${PROXY_PORT}"

exec uvicorn app:app --host "$PROXY_HOST" --port "$PROXY_PORT"

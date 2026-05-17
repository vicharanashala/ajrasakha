#!/usr/bin/env bash
# Run the POP v2 MCP server locally (no Docker): Python venv + streamable-http.
# Port: POP_MCP_PORT (default 9002), read by pop.py.
#
# Debian/Ubuntu: if "ensurepip is not available" when creating .venv, install:
#   apt install python3-venv
# then remove .venv and re-run.
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

exec python "$ROOT/pop.py" "$@"

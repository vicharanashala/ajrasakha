#!/bin/sh
set -e

echo "========================================"
echo "Starting Writing Assistant"
echo "========================================"

# No Tailscale setup needed anymore - Gemini's public API (GEMINI_BASE_URL)
# is directly reachable over HTTPS, unlike the old self-hosted MiniMax
# model's 100.x tailnet address this script used to join a tailnet for.

exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8004}"

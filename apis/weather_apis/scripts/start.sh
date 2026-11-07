#!/bin/sh
set -e

echo "========================================"
echo "Starting Ajrasakha Live Weather API"
echo "========================================"

# ---------------------------------------------------------------------------
# Tailscale (optional) - mirrors apis/writing_assistant/scripts/start.sh
#
# The tailnet is needed in containerized deployments (Cloud Run / Render /
# Docker) to reach self-hosted internal mirror services on 100.x CGNAT
# addresses (e.g. IMD mirror at 100.100.108.101:18080).
#
# If TAILSCALE_AUTHKEY is unset, the container boots in direct-route mode.
# ---------------------------------------------------------------------------
start_tailscale() {
  if [ -z "$TAILSCALE_AUTHKEY" ]; then
    echo "TAILSCALE_AUTHKEY is not set - skipping Tailscale."
    echo "IMD_CITY_BASE must point at a directly-reachable host (or local dev host network)."
    return 0
  fi

  echo "TAILSCALE_AUTHKEY received (length: ${#TAILSCALE_AUTHKEY})"
  echo "Starting tailscaled in userspace networking mode..."

  # Userspace networking exposes SOCKS5 on localhost:1055
  /app/tailscaled \
    --tun=userspace-networking \
    --state=mem: \
    --socks5-server=localhost:1055 &

  i=0
  while [ $i -lt 30 ]; do
    if /app/tailscale status >/dev/null 2>&1; then break; fi
    i=$((i + 1))
    sleep 1
  done

  echo "Running tailscale up..."
  if timeout -k 5 25 /app/tailscale up \
    --auth-key="${TAILSCALE_AUTHKEY}" \
    --hostname="${TAILSCALE_HOSTNAME:-live-weather-api}"; then
    echo "Tailscale connected: $(/app/tailscale ip -4 2>/dev/null | head -1)"
  else
    echo "'tailscale up' FAILED - continuing without tailnet."
    echo "Usual causes: the auth key expired, was single-use, or was revoked."
  fi
}

start_tailscale || true

echo ""
echo "Starting Uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8085}"


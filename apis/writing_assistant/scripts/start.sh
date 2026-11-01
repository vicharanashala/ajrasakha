#!/bin/sh
set -e

echo "========================================"
echo "Starting Writing Assistant"
echo "========================================"

# ---------------------------------------------------------------------------
# Tailscale (optional) - mirrors backend/scripts/start.sh exactly.
#
# The tailnet is only needed to reach the real self-hosted MiniMax model
# (a 100.x CGNAT address). Without TAILSCALE_AUTHKEY, MINIMAX_BASE_URL
# must point at a directly-reachable host instead (e.g. MiniMax's public
# API) - the service works either way, so a Tailscale failure must NEVER
# stop it from booting: Cloud Run kills any container that fails to
# listen on $PORT and reports it as "failed to start", which buries the
# real cause.
# ---------------------------------------------------------------------------
start_tailscale() {
  if [ -z "$TAILSCALE_AUTHKEY" ]; then
    echo "TAILSCALE_AUTHKEY is not set - skipping Tailscale."
    echo "MINIMAX_BASE_URL must point at a directly-reachable host (e.g. the public MiniMax API)."
    return 0
  fi

  echo "TAILSCALE_AUTHKEY received (length: ${#TAILSCALE_AUTHKEY})"
  echo "Starting tailscaled..."

  # --state=mem: - Cloud Run instances are ephemeral, so an on-disk state
  # dir only ever holds a stale identity from a previous container.
  #
  # Userspace networking means there is NO interface for 100.x, so the
  # app can only reach the tailnet through this SOCKS5 proxy - see
  # assistant/llm_client.py's _is_tailnet_host/_TAILNET_SOCKS_PROXY.
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

  # A bad/expired key or no network egress to the control plane makes
  # `tailscale up` retry its login forever instead of failing fast -
  # confirmed directly (it hung indefinitely under exactly that
  # condition). Plain `timeout` alone isn't enough either - confirmed
  # directly that `tailscale up` ignores the SIGTERM `timeout` sends by
  # default and just restarts its internal login loop instead of
  # exiting; `-k 5` forces a SIGKILL 5s later if it's still alive.
  #
  # The auth key must be REUSABLE and EPHEMERAL - every cold start is a
  # new machine, so a single-use key authenticates the first instance
  # and fails on every one after it, and non-ephemeral nodes accumulate
  # in the tailnet as writing-assistant-1, writing-assistant-2, ...
  if timeout -k 5 25 /app/tailscale up \
    --auth-key="${TAILSCALE_AUTHKEY}" \
    --hostname="${TAILSCALE_HOSTNAME:-writing-assistant}"; then
    echo "Tailscale connected: $(/app/tailscale ip -4 2>/dev/null | head -1)"
  else
    echo "'tailscale up' FAILED - continuing without the tailnet."
    echo "Usual causes: the auth key expired, was single-use, or was revoked."
  fi
}

# `|| true` so a non-zero return can never abort the script under `set -e`.
start_tailscale || true

echo ""
echo "Starting Uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8004}"

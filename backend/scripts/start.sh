#!/bin/sh
set -e

echo "========================================"
echo "Starting Reviewer API"
echo "========================================"

# ---------------------------------------------------------------------------
# Tailscale (optional)
#
# The tailnet is only needed to reach the AI / agent / GDB servers (100.x CGNAT
# addresses). The HTTP server itself does not depend on it, so a Tailscale failure must
# NOT stop the app from booting: Cloud Run kills any container that fails to listen on
# $PORT and reports it as "failed to start and listen on the port", which buries the
# real cause.
#
# Everything below therefore tolerates failure and always falls through to Node.
# ---------------------------------------------------------------------------
start_tailscale() {
  if [ -z "$TAILSCALE_AUTHKEY" ]; then
    echo "⚠️  TAILSCALE_AUTHKEY is not set — skipping Tailscale."
    echo "⚠️  Calls to the AI/agent/GDB servers (100.x) will not be routable."
    return 0
  fi

  echo "✅ TAILSCALE_AUTHKEY received (length: ${#TAILSCALE_AUTHKEY})"
  echo "Starting tailscaled..."

  # --state=mem: — Cloud Run instances are ephemeral, so an on-disk state dir only ever
  # holds a stale identity from a previous container.
  /app/tailscaled \
    --tun=userspace-networking \
    --state=mem: \
    --socks5-server=localhost:1055 &

  # Wait for the daemon to answer, rather than sleeping a fixed interval.
  i=0
  while [ $i -lt 30 ]; do
    if /app/tailscale status >/dev/null 2>&1; then break; fi
    i=$((i + 1))
    sleep 1
  done

  echo "Running tailscale up..."

  # The auth key must be REUSABLE and EPHEMERAL: every cold start is a new machine, so a
  # single-use key authenticates the first instance and fails on every one after it, and
  # non-ephemeral nodes accumulate in the tailnet as gcp-1, gcp-2, ...
  if /app/tailscale up \
    --auth-key="${TAILSCALE_AUTHKEY}" \
    --hostname="${TAILSCALE_HOSTNAME:-gcp}"; then
    echo "✅ Tailscale connected: $(/app/tailscale ip -4 2>/dev/null | head -1)"
  else
    echo "⚠️  'tailscale up' FAILED — continuing without the tailnet."
    echo "⚠️  Usual causes: the auth key expired, was single-use, or was revoked."
  fi
}

# `|| true` so a non-zero return can never abort the script under `set -e`.
start_tailscale || true

echo ""
echo "Starting Node application..."

exec dumb-init node build/index.js

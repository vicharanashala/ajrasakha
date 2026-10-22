#!/bin/bash
set -x

# =============================================================================
# Tailscale startup script for Cloud Run
# - Installs Tailscale
# - Starts tailscaled daemon in userspace networking mode
# - Authenticates with Tailscale network
# - Then runs the main app
# =============================================================================

echo "=== INSTALLING TAILSCALE ==="
curl -fsSL https://tailscale.com/install.sh | sh

# Create directories for tailscaled
mkdir -p /var/run/tailscale /var/lib/tailscale

echo "=== STARTING TAILSCALE DAEMON ==="
tailscaled \
  --tun=userspace-networking \
  --socks5-server=127.0.0.1:1055 \
  --outbound-http-proxy-listen=127.0.0.1:1056 &
DAEMON_PID=$!

echo "=== WAITING FOR SOCKET FILE ==="
WAIT_COUNT=0
until [ -S /var/run/tailscale/tailscaled.sock ]; do
    WAIT_COUNT=$((WAIT_COUNT + 1))
    echo "Waiting for tailscaled.sock... (${WAIT_COUNT}s)"
    if [ $WAIT_COUNT -gt 15 ]; then
        echo "ERROR: tailscaled.sock was not created within 15 seconds!"
        exit 1
    fi
    sleep 1
done

echo "=== DAEMON READY, AUTHENTICATING WITH TAILSCALE ==="
tailscale up \
  --reset \
  --authkey=${TAILSCALE_AUTHKEY} \
  --hostname=${TS_HOSTNAME:-golden-api} \
  --accept-routes 2>&1
UP_EXIT_CODE=$?

echo "=== TAILSCALE UP FINISHED (EXIT CODE: $UP_EXIT_CODE) ==="

# Print status details
tailscale status 2>&1

echo "=== STARTING MAIN APPLICATION ==="
# Run the original CMD (uvicorn)
exec "$@"
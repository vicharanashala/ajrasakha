#!/bin/sh
set -e

echo "========================================"
echo "Starting Reviewer API"
echo "========================================"

echo "Checking Tailscale binaries..."

ls -l /app/tailscale
ls -l /app/tailscaled

echo ""
echo "Checking environment..."

if [ -z "$TAILSCALE_AUTHKEY" ]; then
  echo "❌ TAILSCALE_AUTHKEY is NOT set"
else
  echo "✅ TAILSCALE_AUTHKEY received"
  echo "Length: ${#TAILSCALE_AUTHKEY}"
fi

echo ""
echo "Starting tailscaled..."

/app/tailscaled \
  --tun=userspace-networking \
  --socks5-server=localhost:1055 &

sleep 5

echo ""
echo "Running tailscale up..."

/app/tailscale up \
  --auth-key="${TAILSCALE_AUTHKEY}" \
  --hostname=gcp

echo ""
echo "Starting Node application..."

exec dumb-init node build/index.js
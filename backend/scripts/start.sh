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

echo "========== Tailscale Status =========="
/app/tailscale status

echo "========== Tailscale IP =========="
/app/tailscale ip

echo "========== Ping Target =========="
/app/tailscale ping 100.100.108.44 || true
echo ""
echo "========== HTTP TEST =========="

curl -v http://100.100.108.44:2026/threads/5f0ba437-c68d-4a54-97c9-138752acf4d6/state

echo "========== END HTTP TEST =========="
echo "Starting Node application..."

exec dumb-init node build/index.js
#!/usr/bin/env python3
"""
wait-for-socks5.py

Polls the SOCKS5 server on 127.0.0.1:1055 with a real protocol handshake
(RFC 1928 greeting + method-selection response). Exits 0 once SOCKS5 is
confirmed ready, 1 if the timeout is exceeded.

Env vars:
  SOCKS_HOST         default 127.0.0.1
  SOCKS_PORT         default 1055
  SOCKS_TIMEOUT_SEC  default 60 (polling timeout before giving up)

Mirrors the Node.js wait-for-socks5.js pattern from ajrasakha-client but
in Python so the LangGraph container doesn't need Node.js just for this
readiness probe.
"""

import os
import sys
import socket
import time

HOST = os.environ.get("SOCKS_HOST", "127.0.0.1")
PORT = int(os.environ.get("SOCKS_PORT", "1055"))
TIMEOUT_SEC = int(os.environ.get("SOCKS_TIMEOUT_SEC", "60"))
RETRY_INTERVAL = 1.0
PROBE_TIMEOUT = 3.0

start = time.time()

def probe() -> bool:
    """Attempt SOCKS5 handshake. Returns True on success, False on failure."""
    sock = None
    try:
        sock = socket.create_connection((HOST, PORT), timeout=PROBE_TIMEOUT)
        
        # SOCKS5 greeting: ver=5, nmethods=1, method=0 (no auth)
        sock.sendall(b"\x05\x01\x00")
        
        # Expect: ver=5, method=0x00 (no auth accepted)
        data = sock.recv(2)
        if data and data[0] == 0x05 and data[1] == 0x00:
            return True
        print(f"[socks5] unexpected response: {data.hex() if data else 'none'}")
        return False
    except Exception as e:
        print(f"[socks5] probe failed: {e}")
        return False
    finally:
        if sock:
            sock.close()

def main():
    print(f"[socks5] waiting for SOCKS5 proxy at {HOST}:{PORT} (timeout: {TIMEOUT_SEC}s)")
    
    attempt = 0
    while time.time() - start < TIMEOUT_SEC:
        attempt += 1
        elapsed = int(time.time() - start)
        if probe():
            print(f"[socks5] ready after {elapsed}s (attempt #{attempt})")
            sys.exit(0)
        print(f"[socks5] not ready after {elapsed}s (attempt #{attempt}), retrying...")
        time.sleep(RETRY_INTERVAL)
    
    print(f"[socks5] FAILED after {TIMEOUT_SEC}s timeout")
    sys.exit(1)

if __name__ == "__main__":
    main()
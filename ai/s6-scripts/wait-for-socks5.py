#!/usr/bin/env python3
"""Wait for SOCKS5 proxy to be ready."""

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
    try:
        sock = socket.create_connection((HOST, PORT), timeout=PROBE_TIMEOUT)
        # SOCKS5 greeting: ver=5, nmethods=1, method=0 (no auth)
        sock.sendall(b"\x05\x01\x00")
        data = sock.recv(2)
        return data and data[0] == 0x05 and data[1] == 0x00
    except Exception:
        return False
    finally:
        try:
            sock.close()
        except Exception:
            pass

while time.time() - start < TIMEOUT_SEC:
    if probe():
        print(f"SOCKS5 ready after {int(time.time() - start)}s")
        sys.exit(0)
    time.sleep(RETRY_INTERVAL)

print("WARNING: SOCKS5 not ready after timeout, continuing")
sys.exit(0)
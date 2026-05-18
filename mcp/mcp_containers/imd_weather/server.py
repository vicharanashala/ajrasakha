"""Run FastMCP only (same as ``python mcp_app.py``). For API + MCP use ``./run.sh``."""

from __future__ import annotations

from mcp_app import run_mcp_server

if __name__ == "__main__":
    run_mcp_server()

"""Backward-compatible entry: runs FastMCP only. Use ./run.sh for API + MCP."""

from mcp_app import run_mcp_server

if __name__ == "__main__":
    run_mcp_server()

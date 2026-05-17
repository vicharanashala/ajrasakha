"""FastMCP server (streamable HTTP) — same logic as the FastAPI app."""

from __future__ import annotations

import os

from dotenv import load_dotenv
from fastmcp import FastMCP

from common import ensure_pop_started
from constants import MCP_HOST, MCP_PORT
from logging_config import get_logger, setup_logging
from models import POPContextResponse
from pop_service import (
    get_context_from_package_of_practices as fetch_pop_context,
    get_pop_states_and_crops_export,
)

load_dotenv()
setup_logging()
logger = get_logger("mcp")

mcp = FastMCP("ajrasakha-pop-mcp")


@mcp.tool()
async def get_pop_states_and_crops() -> dict:
    """Return cached POP states and crops-per-state (refreshed from DB every 6 hours)."""
    ensure_pop_started()
    return get_pop_states_and_crops_export()


@mcp.tool()
async def get_context_from_package_of_practices(
    query: str, state: str, crop: str
) -> POPContextResponse:
    """
    Retrieve POP context chunks for a query filtered by state and crop.

    Priority: doc_origin matches state, then central, then other origins.
    Only chunks with similarity >= 0.8 are returned (up to 5 unique documents).
    """
    ensure_pop_started()
    return await fetch_pop_context(query, state, crop)


def run_mcp_server() -> None:
    ensure_pop_started()
    host = os.getenv("POP_MCP_HOST", MCP_HOST).strip()
    port = int(os.getenv("POP_MCP_PORT", str(MCP_PORT)))
    path = os.getenv("POP_MCP_PATH", "/mcp").strip() or "/mcp"
    logger.info("starting POP v2 MCP host=%s port=%d path=%s", host, port, path)
    mcp.run(
        transport="streamable-http",
        host=host,
        port=port,
        path=path,
    )


if __name__ == "__main__":
    run_mcp_server()

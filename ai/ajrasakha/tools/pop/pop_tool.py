"""
Package of Practices (PoP) tools for retrieving state-specific crop advisory
content when the Golden DB does not have a relevant answer.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from langchain.tools import tool
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

POP_BASE_URL = os.getenv("POP_BASE_URL", "https://pop.vicharanashala.ai/api").rstrip(
    "/"
)
TIMEOUT = float(os.getenv("POP_TIMEOUT_SECONDS", "30"))

mcp = FastMCP(
    "ajrasakha-pop-mcp",
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


async def _get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Execute an async GET request against the PoP API."""
    url = f"{POP_BASE_URL}/{path.lstrip('/')}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(url, params=params)
            res.raise_for_status()
            return {"success": True, "data": res.json()}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@tool
@mcp.tool()
async def get_available_states_pop() -> dict[str, Any]:
    """
    Get all states that have Package of Practices (PoP) data available.
    Call this before get_context_from_pop to find valid state names.
    """
    return await _get("states")


@tool
@mcp.tool()
async def get_context_from_pop(
    query: str,
    state: str,
    crop: str | None = None,
) -> dict[str, Any]:
    """
    Retrieve Package of Practices context for a given query, state, and optional crop.
    Use this as a fallback when the Golden DB returns no relevant results.
    Call get_available_states_pop first to resolve the correct state name.
    """
    params: dict[str, Any] = {"query": query, "state": state}
    if crop:
        params["crop"] = crop
    return await _get("context", params)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")

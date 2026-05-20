import os
import logging
from typing import Optional

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from langchain_mcp_adapters.client import MultiServerMCPClient

logger = logging.getLogger(__name__)


class GDBInput(BaseModel):
    query: str
    crop: str = Field(
        ...,
        description=(
            "Crop for Golden DB retrieval (required). Use the crop from the farmer's "
            "question; use 'all' only as a last resort when not crop-specific."
        ),
    )
    state: str = Field(
        ...,
        description=(
            "Indian state for Golden DB retrieval (required). Use thread location state "
            "or the state in the farmer's message; use 'all' only as a last resort."
        ),
    )
    rephrased_query: Optional[str] = Field(
        None,
        description="The query refined by the planner agent (grammar/spelling corrected)."
    )
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None


@tool(args_schema=GDBInput)
async def gdb(
    query: str,
    crop: str,
    state: str,
    latitude: Optional[float],
    longitude: Optional[float],
    address: Optional[str],
    config: RunnableConfig,
    rephrased_query: Optional[str] = None,
) -> str:
    """
    Query the golden database directly for crop/disease/pest/farming knowledge.

    crop and state are required. Pass them on every call (use thread location for state
    when available; use 'all' for crop or state only as a last resort when unknown).
    """
    import json

    def clean_fallback(val: str) -> str:
        v = (val or "").strip().lower()
        if not v or v in {"not specified", "general", "none", "null", "all"}:
            return "all"
        return val.strip()

    resolved_crop = clean_fallback(crop)
    injected: dict = (config.get("configurable") or {}).get("location") or {}
    resolved_state = clean_fallback(injected.get("state") or state)
    resolved_rephrased = (rephrased_query or "").strip() or query

    fallback_response = json.dumps({
        "original_query": query,
        "rephrased_query": resolved_rephrased,
        "state": resolved_state,
        "crop": resolved_crop,
        "exact_match": {},
        "similar_match": {}
    })

    try:
        # Load GDB MCP endpoint URL from the environment or config
        gdb_url = os.getenv("GDB_MCP_URL")
        if not gdb_url:
            from ajrasakha.agents.config import MCP_URLS
            gdb_url = MCP_URLS.get("gdb")

        if not gdb_url:
            logger.error("GDB_MCP_URL is not configured in .env or config!")
            return fallback_response

        # Robust URL parsing to handle raw IP/port or Portainer "9005/tcp" formats
        gdb_url = gdb_url.strip()
        if not gdb_url.startswith(("http://", "https://")):
            clean_url = gdb_url
            if clean_url.endswith("/tcp"):
                clean_url = clean_url[:-4]
            # If it doesn't end with a path, append /mcp
            if "/" not in clean_url.split(":")[-1]:
                clean_url = clean_url.rstrip("/") + "/mcp"
            gdb_url = f"http://{clean_url}"

        logger.info("Connecting to decoupled GDB MCP server at: %s", gdb_url)
        
        # Instantiate MultiServerMCPClient to invoke tool remotely
        client = MultiServerMCPClient(
            {
                "mcp_golden": {
                    "url": gdb_url,
                    "transport": "streamable_http",
                }
            }
        )
        
        tools = await client.get_tools()
        gdb_search_tool = next((t for t in tools if "gdb_search" in t.name), None)
        
        if not gdb_search_tool:
            logger.error("gdb_search tool not found on decoupled MCP server. Available tools: %s", [t.name for t in tools])
            return fallback_response

        # Invoke the decoupled native RAG pipeline directly
        logger.info("Invoking decoupled native GDB search (query=%s, rephrased_query=%s, crop=%s, state=%s)", query, resolved_rephrased, resolved_crop, resolved_state)
        result = await gdb_search_tool.ainvoke({
            "query": query,
            "crop": resolved_crop,
            "state": resolved_state,
            "rephrased_query": resolved_rephrased
        })
        
        # Parse and normalise the response
        if isinstance(result, list):
            res_str = "".join([
                item.get("text", "") if isinstance(item, dict)
                else str(item)
                for item in result
            ])
        else:
            res_str = str(result)
            
        res_str = res_str.strip()
        if not res_str or res_str.upper() == "NO_RELEVANT_CONTENT":
            return fallback_response
        return res_str

    except Exception as exc:
        logger.error("gdb query execution failed: %s", exc, exc_info=True)
        return fallback_response
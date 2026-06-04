import json
import logging
import re
from datetime import timedelta
from typing import Optional

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import ToolException, tool
from pydantic import BaseModel, Field
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.tools import load_mcp_tools

from ajrasakha.agents.config import MCP_URLS

logger = logging.getLogger(__name__)

GDB_MCP_SERVER = "mcp_golden"
# gdb_search runs strict + atlas + embed/vector; default MCP HTTP timeout (30s) is too short.
GDB_MCP_HTTP_TIMEOUT = timedelta(seconds=120)
GDB_MCP_SSE_READ_TIMEOUT = timedelta(seconds=300)

# Maximum number of similar pairs to return in the response.
MAX_SIMILAR_PAIRS = 5


def _gdb_mcp_connection() -> dict:
    return {
        "url": MCP_URLS["gdb"],
        "transport": "streamable-http",
        "timeout": GDB_MCP_HTTP_TIMEOUT,
        "sse_read_timeout": GDB_MCP_SSE_READ_TIMEOUT,
    }


def _standardize_label(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return "all"
    return " ".join(word.capitalize() for word in re.sub(r"\s+", " ", value).split())


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


def _normalize_details_list(raw_details) -> list[dict]:
    """Normalize raw details into a list of source dicts, preserving ALL entries."""
    if isinstance(raw_details, list):
        result = []
        for item in raw_details:
            if isinstance(item, dict):
                result.append({
                    "source_name": item.get("source_name") or None,
                    "source_link": item.get("source_link") or None,
                    "author_name": item.get("author_name") or None,
                })
        return result if result else []
    elif isinstance(raw_details, dict):
        return [{
            "source_name": raw_details.get("source_name") or None,
            "source_link": raw_details.get("source_link") or None,
            "author_name": raw_details.get("author_name") or None,
        }]
    return []


def _normalize_gdb_response(raw_json: dict, query: str, rephrased: str, crop: str, state: str) -> dict:
    """Post-process the raw GDB MCP response into a structured format.

    Output format:
    {
      "original_query": "...",
      "rephrased_query": "...",
      "state": "...",
      "crop": "...",
      "is_exact": true/false,
      "is_similar": true/false,
      "exact_match": { question_id, similarity_score, question, answer, details: [...] },
      "similar_pair1": { question_id, similarity_score, question, answer, details: [...] },
      "similar_pair2": { ... },
      ...top 5 pairs
    }
    """
    result: dict = {
        "original_query": raw_json.get("original_query", query),
        "rephrased_query": raw_json.get("rephrased_query", rephrased),
        "state": raw_json.get("state", state),
        "crop": raw_json.get("crop", crop),
        "is_exact": False,
        "is_similar": False,
    }

    # ── Exact match ──────────────────────────────────────────────────────
    exact = raw_json.get("exact_match") or {}
    if exact and (exact.get("answer") or exact.get("question")):
        result["is_exact"] = True
        details_list = _normalize_details_list(exact.get("details") or [])
        result["exact_match"] = {
            "question_id": exact.get("question_id") or "",
            "similarity_score": 1,
            "retrieval_source": exact.get("retrieval_source") or "strict_exact",
            "question": exact.get("question") or "",
            "answer": exact.get("answer") or "",
            "details": details_list,
        }
    else:
        result["exact_match"] = {}

    # ── Similar matches (top 5) ──────────────────────────────────────────
    similar_raw = raw_json.get("similar_match") or {}
    if isinstance(similar_raw, dict) and similar_raw:
        # Sort by pair key numerically (pair_1, pair_2, ...)
        sorted_keys = sorted(
            similar_raw.keys(),
            key=lambda x: int("".join(filter(str.isdigit, x)) or "0"),
        )
        # Limit to top MAX_SIMILAR_PAIRS
        top_keys = sorted_keys[:MAX_SIMILAR_PAIRS]

        if top_keys:
            result["is_similar"] = True

        for idx, key in enumerate(top_keys, 1):
            pair = similar_raw[key]
            if not isinstance(pair, dict):
                continue
            details_list = _normalize_details_list(pair.get("details") or [])
            result[f"similar_pair{idx}"] = {
                "question_id": pair.get("question_id") or "",
                "similarity_score": pair.get("similarity_score"),
                "retrieval_source": pair.get("retrieval_source"),
                "question": pair.get("question") or "",
                "answer": pair.get("answer") or "",
                "details": details_list,
            }

    return result


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

    def clean_fallback(val: str) -> str:
        v = (val or "").strip().lower()
        if not v or v in {"not specified", "general", "none", "null", "all"}:
            return "all"
        return val.strip()

    resolved_crop = _standardize_label(clean_fallback(crop))
    # State comes directly from the planner's deterministic resolution.
    # We no longer override it from the thread's injected location config,
    # because the planner already resolved state from query text or GPS.
    resolved_state = _standardize_label(clean_fallback(state))
    resolved_rephrased = (rephrased_query or "").strip() or query

    fallback_response = json.dumps({
        "original_query": query,
        "rephrased_query": resolved_rephrased,
        "state": resolved_state,
        "crop": resolved_crop,
        "is_exact": False,
        "is_similar": False,
        "exact_match": {},
    })

    mcp_url = MCP_URLS["gdb"]
    logger.info("gdb() connecting MCP → %s (single session)", mcp_url)

    try:
        connection = _gdb_mcp_connection()
        client = MultiServerMCPClient({GDB_MCP_SERVER: connection})

        async with client.session(GDB_MCP_SERVER) as session:
            tools = await load_mcp_tools(
                session,
                connection=connection,
                server_name=GDB_MCP_SERVER,
            )
            logger.info("MCP tools loaded: %s", [t.name for t in tools])

            gdb_search_tool = next((t for t in tools if "gdb_search" in t.name), None)
            if not gdb_search_tool:
                logger.error(
                    "gdb_search tool not found. Available tools: %s",
                    [t.name for t in tools],
                )
                return fallback_response

            logger.info(
                "Invoking %s (query=%r, rephrased=%r, crop=%s, state=%s)",
                gdb_search_tool.name,
                query[:80],
                resolved_rephrased[:80],
                resolved_crop,
                resolved_state,
            )
            try:
                result = await gdb_search_tool.ainvoke({
                    "query": query,
                    "crop": resolved_crop,
                    "state": resolved_state,
                    "rephrased_query": resolved_rephrased,
                })
            except ToolException as exc:
                logger.error("gdb_search returned MCP error: %s", exc)
                return fallback_response

        # Parse and normalise the response
        if isinstance(result, tuple) and len(result) >= 1:
            result = result[0]
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

        # Post-process into structured format with is_exact/is_similar flags
        try:
            raw_data = json.loads(res_str)
            if isinstance(raw_data, dict):
                normalized = _normalize_gdb_response(
                    raw_data, query, resolved_rephrased, resolved_crop, resolved_state
                )
                logger.info(
                    "GDB response: is_exact=%s, is_similar=%s",
                    normalized.get("is_exact"),
                    normalized.get("is_similar"),
                )
                return json.dumps(normalized)
        except json.JSONDecodeError:
            pass

        # If response isn't JSON, return as-is
        return res_str

    except ToolException as exc:
        logger.error("gdb MCP tool error: %s", exc)
        return fallback_response
    except Exception as exc:
        logger.error("gdb MCP call failed: %s", exc, exc_info=True)
        return fallback_response

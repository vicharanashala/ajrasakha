import os
import json
import logging
import re
from typing import Optional

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from langchain_mcp_adapters.client import MultiServerMCPClient

from ajrasakha.agents.config import MCP_URLS
logger = logging.getLogger(__name__)

# Maximum number of similar pairs to return in the response.
MAX_SIMILAR_PAIRS = 5


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
      "exact_match": { question, answer, details: [{source_name, source_link, author_name}] },
      "similar_pair1": { question, answer, details: {source_name, source_link, author_name} },
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
        # Normalize details to a single dict (take first entry if list)
        raw_details = exact.get("details") or []
        details_dict = {}
        if isinstance(raw_details, list) and raw_details:
            d = raw_details[0] if isinstance(raw_details[0], dict) else {}
            details_dict = {
                "source_name": d.get("source_name") or None,
                "source_link": d.get("source_link") or None,
                "author_name": d.get("author_name") or None,
            }
        elif isinstance(raw_details, dict):
            details_dict = {
                "source_name": raw_details.get("source_name") or None,
                "source_link": raw_details.get("source_link") or None,
                "author_name": raw_details.get("author_name") or None,
            }
        result["exact_match"] = {
            "question": exact.get("question") or "",
            "answer": exact.get("answer") or "",
            "details": details_dict,
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
            raw_details = pair.get("details") or []
            details_dict = {}
            if isinstance(raw_details, list) and raw_details:
                d = raw_details[0] if isinstance(raw_details[0], dict) else {}
                details_dict = {
                    "source_name": d.get("source_name") or None,
                    "source_link": d.get("source_link") or None,
                    "author_name": d.get("author_name") or None,
                }
            elif isinstance(raw_details, dict):
                details_dict = {
                    "source_name": raw_details.get("source_name") or None,
                    "source_link": raw_details.get("source_link") or None,
                    "author_name": raw_details.get("author_name") or None,
                }
            result[f"similar_pair{idx}"] = {
                "question": pair.get("question") or "",
                "answer": pair.get("answer") or "",
                "details": details_dict,
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

    print("[gdb_agent] gdb() called — starting MCP connection", flush=True)

    try:
        # Load GDB MCP endpoint URL from the environment or config
        # gdb_url = os.getenv("GDB_MCP_URL")



        # if not gdb_url:
        #     from ajrasakha.agents.config import MCP_URLS
        #     gdb_url = MCP_URLS.get("gdb")

        # if not gdb_url:
        #     logger.error("GDB_MCP_URL is not configured in .env or config!")
        #     return fallback_response

        # logger.info("Connecting to decoupled GDB MCP server at: %s", gdb_url)
        
        # Instantiate MultiServerMCPClient to invoke tool remotely
        # client = MultiServerMCPClient(
        #     {
        #         "mcp_golden": {
        #             "url": gdb_url,
        #             "transport": "streamable_http",
        #         }
        #     }
        # )

        mcp_url = MCP_URLS["gdb"]
        print(f"[gdb_agent] Connecting MCP → {mcp_url}", flush=True)

        client = MultiServerMCPClient(
            {
                "mcp_golden": {
                    "url": mcp_url,
                    "transport": "streamable-http",
                }
            }
        )
        print("[gdb_agent] MultiServerMCPClient created OK", flush=True)

        tools = await client.get_tools()
        print(f"[gdb_agent] MCP get_tools() OK — tools: {[t.name for t in tools]}", flush=True)

        gdb_search_tool = next((t for t in tools if "gdb_search" in t.name), None)

        if not gdb_search_tool:
            logger.error("gdb_search tool not found on decoupled MCP server. Available tools: %s", [t.name for t in tools])
            print("[gdb_agent] MCP FAILED — gdb_search tool not found on server", flush=True)
            return fallback_response

        print(f"[gdb_agent] MCP connected — using tool: {gdb_search_tool.name}", flush=True)

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

    except Exception as exc:
        logger.error("gdb query execution failed: %s", exc, exc_info=True)
        print(f"[gdb_agent] MCP FAILED — {type(exc).__name__}: {exc}", flush=True)
        return fallback_response

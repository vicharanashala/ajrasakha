"""Daily mandi price agent — v2 data model.

Same behaviour as ``daily_price_agent`` (intent → mandi_price_tool → answer); it
reuses that module's intent extraction, argument building and answer rendering.
The only difference is the tool it calls: the v2 MCP server
(``MCP_URLS["daily_price_v2"]``, tools/daily_price_v2), which reads the v2
database where crop and mandi names are matched only through approved links.

Selected in ``tool_registry`` with ``DAILY_PRICE_AGENT_VERSION=v2``. The tool keeps
the name ``daily_price`` so the planner and executor treat it exactly like v1.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient

from ajrasakha.agents import daily_price_agent as v1
from ajrasakha.agents.config import MCP_URLS
from ajrasakha.agents.daily_price_support import MISSING_COMMODITY, MISSING_LOCATION, clarify_reason_for_error, detect_unsupported_query
from ajrasakha.agents.location_context import profile_location_note

logger = logging.getLogger(__name__)

_mcp: MultiServerMCPClient | None = None
_tool_obj = None


def _get_mcp() -> MultiServerMCPClient:
    global _mcp
    if _mcp is None:
        _mcp = MultiServerMCPClient(
            {"daily_price_v2": {"url": MCP_URLS["daily_price_v2"], "transport": "streamable_http"}}
        )
    return _mcp


async def _get_tool():
    global _tool_obj
    if _tool_obj is None:
        tools = await _get_mcp().get_tools()
        _tool_obj = next((t for t in tools if getattr(t, "name", "") == "mandi_price_tool"), tools[0] if tools else None)
    return _tool_obj


async def call_mandi_price_tool(args: dict[str, Any]) -> Any:
    """Programmatic MCP invoke of the v2 mandi_price_tool."""
    tool_obj = await _get_tool()
    if tool_obj is None:
        logger.error("mandi_price_tool unavailable from daily_price_v2 MCP")
        return {"error": "mandi_price_tool unavailable"}
    try:
        return await tool_obj.ainvoke(args)
    except Exception as exc:
        logger.error("v2 mandi_price_tool invoke failed: %s", exc, exc_info=True)
        return {"error": str(exc)}


@tool(args_schema=v1.DailyPriceInput)
async def daily_price(
    query: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    crop: str = "all",
    state: Optional[str] = None,
    district: Optional[str] = None,
    location_from_profile: Optional[bool] = None,
    village: Optional[str] = None,
    block: Optional[str] = None,
    config: RunnableConfig = None,
) -> str:
    """
    Query daily mandi / commodity prices near the farmer.
    Use when the user asks for crop market prices, mandi rates, or nearest APMC prices.
    Requires crop name and resolved latitude/longitude when possible.
    """
    try:
        declined = detect_unsupported_query(query)
        if declined:
            logger.info("daily_price_v2_agent: declining query (reason=%s): %s", declined, query)
            return v1._decline_envelope(declined)

        lat, lon = latitude, longitude
        if lat is None or lon is None:
            from ajrasakha.agents.location_extractor import get_lat_long as _get_lat_long

            _lat, _lon, _resolved_name = await _get_lat_long(district=district, subdistrict=None, state=state)
            if _lat is not None and _lon is not None:
                lat, lon = _lat, _lon
                logger.info("daily_price_v2_agent: geocoded state=%r district=%r -> %s, %s (%s)", state, district, lat, lon, _resolved_name)

        intent = await v1.extract_daily_price_intent(query, crop=crop, state=state, lat=lat, lon=lon, config=config)
        logger.info("Daily price (v2) intent: %s", intent)
        if intent.get("unsupported_reason"):
            return v1._decline_envelope(intent["unsupported_reason"])

        tool_args = v1._build_tool_args(intent, lat=lat, lon=lon, crop=crop, state=state, district=district)
        actions = intent.get("actions") or [intent["action"]]
        if any(a in v1._COMMODITY_ACTIONS for a in actions) and not tool_args.get("commodity_name"):
            return v1._decline_envelope(MISSING_COMMODITY)
        if any(a in v1._GEO_ACTIONS for a in actions) and (tool_args.get("lat") is None or tool_args.get("long") is None):
            if not tool_args.get("state") and not tool_args.get("market_name"):
                return v1._decline_envelope(MISSING_LOCATION)

        tool_result = await call_mandi_price_tool(tool_args)
        tool_payload = v1._unwrap_tool_payload(tool_result)
        logger.info("daily_price_v2_agent tool_data: %s", json.dumps(tool_payload, ensure_ascii=False, default=str)[:8000])

        clarify = clarify_reason_for_error(tool_payload)
        if clarify:
            return v1._decline_envelope(clarify)

        effective_crop = (
            ", ".join(tool_args["commodity_name"])
            if isinstance(tool_args.get("commodity_name"), list)
            else (tool_args.get("commodity_name") or crop)
        )
        answer = await v1.synthesize_daily_price_answer(
            query, tool_result, crop=effective_crop, state=tool_args.get("state") or state,
            market_name=tool_args.get("market_name"), config=config,
        ) or ""
        if answer and location_from_profile and not v1._tool_result_is_empty(tool_payload):
            answer += f"\n\n{profile_location_note('mandi price', state, district)}"
        if answer and intent.get("dropped_actions"):
            answer += (
                f"\n\nNote: I answered the first {v1.MAX_INTENT_ACTIONS} parts of your question. "
                "Please ask the remaining part separately."
            )
        return json.dumps(
            {
                "answer": answer,
                "tool_data": tool_payload,
                "status": "no_data" if v1._tool_result_is_empty(tool_payload) else "ok",
                "reason": None,
            },
            ensure_ascii=False,
            default=str,
        )
    except Exception as exc:
        logger.error("daily_price v2 agent failed: %s", exc, exc_info=True)
        return json.dumps(
            {"answer": v1._fallback_unavailable_answer({"error": str(exc)}, crop=crop, state=state), "tool_data": {"error": str(exc)}},
            default=str,
        )

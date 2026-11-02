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
from ajrasakha.agents.daily_price_v2_formatter import SERVICE_ERROR_MESSAGE, has_any_data, render_answer
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
        return {"error": SERVICE_ERROR_MESSAGE, "error_code": "SERVICE_ERROR"}


_PLACEHOLDERS = {"", "all", "not specified", "unknown", "none", "null", "na", "n/a"}


async def _farmer_location(state: Optional[str], district: Optional[str], place: Optional[str]) -> tuple[Optional[float], Optional[float]]:
    """Coordinates for the farmer's district (or block/village in it).

    A state alone is not a location: its capital could be hundreds of km from the
    farmer, and "mandis within 40 km" of it would be wrong. Without a district the
    tool answers for the whole state instead. The geocoder's state-capital fallback
    is discarded for the same reason.
    """
    from ajrasakha.agents.location_extractor import _state_center_fallback, get_lat_long

    if str(district or "").strip().lower() in _PLACEHOLDERS:
        return None, None
    lat, lon, name = await get_lat_long(district=district, subdistrict=place, state=state)
    if lat is None or lon is None:
        return None, None
    c_lat, c_lon, _ = _state_center_fallback(state)
    if c_lat is not None and abs(lat - c_lat) < 1e-6 and abs(lon - c_lon) < 1e-6:
        logger.info("daily_price_v2_agent: geocoder gave only the state capital for %r/%r; not using it.", district, state)
        return None, None
    logger.info("daily_price_v2_agent: geocoded state=%r district=%r -> %s, %s (%s)", state, district, lat, lon, name)
    return lat, lon


def _envelope_tool_data(payload: Any) -> Any:
    """Tool payload for the envelope; a failure's message is kept under "message".

    The plan executor replaces an answer that is just the raw tool error with a generic
    "price not available in this mandi" reply. v2 messages are written for the farmer
    (today's price not reported yet, unknown crop, did you mean ...), so they are kept.
    """
    if isinstance(payload, dict) and payload.get("error"):
        data = {k: v for k, v in payload.items() if k != "error"}
        data["message"] = payload["error"]
        return data
    return payload


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
            lat, lon = await _farmer_location(state, district, block or village)

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
        if not isinstance(tool_payload, dict):
            logger.error("daily_price_v2_agent: unexpected tool reply %r", str(tool_payload)[:500])
            tool_payload = {"error": SERVICE_ERROR_MESSAGE, "error_code": "SERVICE_ERROR"}
        elif tool_payload.get("error") and not tool_payload.get("error_code"):
            # An error from the transport or an old server, not a message written for farmers.
            logger.error("daily_price_v2_agent: tool error without a code: %s", tool_payload.get("error"))
            tool_payload = {"error": SERVICE_ERROR_MESSAGE, "error_code": "SERVICE_ERROR"}

        clarify = clarify_reason_for_error(tool_payload)
        if clarify:
            return v1._decline_envelope(clarify)

        effective_crop = (
            ", ".join(tool_args["commodity_name"])
            if isinstance(tool_args.get("commodity_name"), list)
            else (tool_args.get("commodity_name") or crop)
        )
        has_data = has_any_data(tool_payload)
        answer = render_answer(tool_payload, crop=effective_crop)
        if answer and location_from_profile and has_data:
            answer += f"\n\n{profile_location_note('mandi price', state, district)}"
        if answer and intent.get("dropped_actions"):
            answer += (
                f"\n\nNote: I answered the first {v1.MAX_INTENT_ACTIONS} parts of your question. "
                "Please ask the remaining part separately."
            )
        return json.dumps(
            {
                "answer": answer,
                "tool_data": _envelope_tool_data(tool_payload),
                "status": "ok" if has_data else "no_data",
                "reason": None if has_data else (tool_payload.get("reason") or tool_payload.get("error_code")),
            },
            ensure_ascii=False,
            default=str,
        )
    except Exception as exc:
        logger.error("daily_price v2 agent failed: %s", exc, exc_info=True)
        return json.dumps(
            {
                "answer": SERVICE_ERROR_MESSAGE,
                "tool_data": {"message": SERVICE_ERROR_MESSAGE, "error_code": "SERVICE_ERROR"},
                "status": "no_data",
                "reason": "SERVICE_ERROR",
            },
            ensure_ascii=False,
        )

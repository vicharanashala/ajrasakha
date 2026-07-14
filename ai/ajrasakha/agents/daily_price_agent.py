"""Daily mandi price agent: Gemma intent → programmatic mandi_price_tool → Gemma answer."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from pydantic import BaseModel

from ajrasakha.agents.config import MCP_URLS
from ajrasakha.agents.llm_trace import trace_llm_error, trace_llm_request, trace_llm_response
from ajrasakha.agents.prompts import DAILY_PRICE_ANSWER_PROMPT, DAILY_PRICE_INTENT_PROMPT

logger = logging.getLogger(__name__)

load_dotenv()

DAILY_PRICE_GEMMA_BASE_URL = os.getenv("WEATHER_GEMMA_BASE_URL", "http://100.100.108.44:8014/v1")
DAILY_PRICE_GEMMA_MODEL = "google/gemma-4-E4B-it"

_FARMER_ACTIONS = frozenset({"get_prices", "search_markets", "lookup_commodity"})

_daily_price_mcp: MultiServerMCPClient | None = None
_mandi_price_tool = None


def _get_daily_price_mcp() -> MultiServerMCPClient:
    global _daily_price_mcp
    if _daily_price_mcp is None:
        _daily_price_mcp = MultiServerMCPClient(
            {
                "daily_price": {
                    "url": MCP_URLS["daily_price"],
                    "transport": "streamable_http",
                }
            }
        )
    return _daily_price_mcp


async def _get_mandi_price_tool():
    global _mandi_price_tool
    if _mandi_price_tool is None:
        tools = await _get_daily_price_mcp().get_tools()
        for t in tools:
            name = getattr(t, "name", None) or ""
            if name == "mandi_price_tool":
                _mandi_price_tool = t
                break
        if _mandi_price_tool is None and tools:
            _mandi_price_tool = tools[0]
    return _mandi_price_tool


def _heuristic_intent(query: str) -> dict[str, Any]:
    """Fallback intent when Gemma is unavailable."""
    q = (query or "").lower()
    if "which market" in q or "nearest market" in q or "mandi near" in q or "find market" in q:
        return {
            "action": "search_markets",
            "nearest_market": True,
            "radius_km": 50,
            "lookback_days": None,
            "from_date": None,
            "to_date": None,
            "market_name": None,
            "state": None,
        }
    if "alias" in q or "also known" in q or "canonical" in q or "what is the crop name" in q:
        return {
            "action": "lookup_commodity",
            "nearest_market": False,
            "radius_km": None,
            "lookback_days": None,
            "from_date": None,
            "to_date": None,
            "market_name": None,
            "state": None,
        }
    lookback = 7
    if "month" in q or "30 day" in q:
        lookback = 30
    elif "week" in q or "7 day" in q:
        lookback = 7
    elif "today" in q or "current" in q or "latest" in q or "now" in q:
        lookback = 3
    return {
        "action": "get_prices",
        "nearest_market": True,
        "radius_km": None,
        "lookback_days": lookback,
        "from_date": None,
        "to_date": None,
        "market_name": None,
        "state": None,
    }


def _extract_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    json_blocks = re.findall(r"```(?:json)?(.*?)```", text, re.DOTALL)
    if json_blocks:
        candidate = json_blocks[0].strip()
    else:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        candidate = match.group(0).strip() if match else text.strip()
    try:
        data = json.loads(candidate)
    except (json.JSONDecodeError, TypeError):
        return None
    return data if isinstance(data, dict) else None


def _normalize_intent(raw: dict[str, Any] | None, query: str) -> dict[str, Any]:
    base = _heuristic_intent(query)
    if not raw:
        return base
    action = str(raw.get("action") or base["action"]).strip().lower()
    if action not in _FARMER_ACTIONS:
        action = "get_prices"
    out = {
        "action": action,
        "nearest_market": bool(raw.get("nearest_market", base.get("nearest_market", True))),
        "radius_km": raw.get("radius_km", base.get("radius_km")),
        "lookback_days": raw.get("lookback_days", base.get("lookback_days")),
        "from_date": raw.get("from_date", base.get("from_date")),
        "to_date": raw.get("to_date", base.get("to_date")),
        "market_name": raw.get("market_name", base.get("market_name")),
        "state": raw.get("state", base.get("state")),
    }
    for key in ("radius_km", "lookback_days"):
        val = out.get(key)
        if val is None or val == "":
            out[key] = None
            continue
        try:
            out[key] = float(val) if key == "radius_km" else int(val)
        except (TypeError, ValueError):
            out[key] = base.get(key)
    for key in ("from_date", "to_date", "market_name", "state"):
        val = out.get(key)
        if val is None or str(val).strip().lower() in {"", "null", "none"}:
            out[key] = None
        else:
            out[key] = str(val).strip()
    return out


async def _gemma_chat(
    *,
    trace_name: str,
    user_content: str,
    max_tokens: int,
    temperature: float = 0.0,
    query: str | None = None,
) -> str | None:
    trace_llm_request(
        trace_name,
        model=DAILY_PRICE_GEMMA_MODEL,
        messages=[HumanMessage(content=user_content)],
        query=query,
        api_base=DAILY_PRICE_GEMMA_BASE_URL,
    )
    url = f"{DAILY_PRICE_GEMMA_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": DAILY_PRICE_GEMMA_MODEL,
        "messages": [{"role": "user", "content": user_content}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {"Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=20.0)
            if response.status_code != 200:
                trace_llm_error(trace_name, error=f"HTTP {response.status_code}")
                return None
            result = response.json()
            message = result["choices"][0]["message"]
            content = (message.get("content") or "").strip()
            reasoning = (message.get("reasoning") or "").strip()
            raw = content or reasoning
            trace_llm_response(trace_name, output=raw, source="gemma")
            return raw
    except Exception as exc:
        logger.warning("Gemma %s failed: %s", trace_name, exc)
        trace_llm_error(trace_name, error=f"{type(exc).__name__}: {exc}")
        return None


async def extract_daily_price_intent(query: str) -> dict[str, Any]:
    """Ask Gemma for mandi_price_tool params; fall back to heuristics."""
    user_content = f"{DAILY_PRICE_INTENT_PROMPT}\n\nQuery: {query}\nJSON:"
    raw_text = await _gemma_chat(
        trace_name="daily_price_intent",
        user_content=user_content,
        max_tokens=300,
        query=query,
    )
    parsed = _extract_json_object(raw_text or "")
    intent = _normalize_intent(parsed, query)
    if parsed is None:
        trace_llm_response(
            "daily_price_intent",
            output=json.dumps(intent),
            source="heuristic_fallback",
        )
    return intent


def _tool_result_is_empty(result: Any) -> bool:
    if result is None or result == "":
        return True
    if isinstance(result, str):
        try:
            result = json.loads(result)
        except (json.JSONDecodeError, TypeError):
            return not result.strip()
    if not isinstance(result, dict):
        return False
    if result.get("error"):
        return True
    if "price_records" in result:
        records = result.get("price_records") or []
        return len(records) == 0
    if "markets" in result:
        return len(result.get("markets") or []) == 0
    if "resolutions" in result:
        resolutions = result.get("resolutions") or {}
        if not resolutions:
            return True
        return not any(
            isinstance(v, dict) and v.get("matched") for v in resolutions.values()
        )
    if "commodities" in result or "results" in result:
        items = result.get("commodities") or result.get("results") or []
        return len(items) == 0
    if result.get("count") == 0:
        return True
    return False


async def call_mandi_price_tool(args: dict[str, Any]) -> Any:
    """Programmatic MCP invoke of mandi_price_tool."""
    tool_obj = await _get_mandi_price_tool()
    if tool_obj is None:
        logger.error("mandi_price_tool unavailable from daily_price MCP")
        return {"error": "mandi_price_tool unavailable"}
    try:
        return await tool_obj.ainvoke(args)
    except Exception as exc:
        logger.error("mandi_price_tool invoke failed: %s", exc, exc_info=True)
        return {"error": str(exc)}


def _build_tool_args(
    intent: dict[str, Any],
    *,
    lat: float | None,
    lon: float | None,
    crop: str,
    state: str | None,
) -> dict[str, Any]:
    action = intent["action"]
    args: dict[str, Any] = {"action": action}
    tool_state = intent.get("state") or state
    if tool_state and str(tool_state).strip().lower() not in {"all", "not specified", "unknown"}:
        args["state"] = str(tool_state).strip()

    if action in {"get_prices", "lookup_commodity"}:
        crop_clean = (crop or "").strip()
        if crop_clean and crop_clean.lower() not in {"all", "any", "general"}:
            args["commodity_name"] = [crop_clean]

    if action in {"get_prices", "search_markets"}:
        if lat is not None and lon is not None:
            args["lat"] = float(lat)
            args["long"] = float(lon)
        args["nearest_market"] = bool(intent.get("nearest_market", True))
        if intent.get("radius_km") is not None:
            args["radius_km"] = intent["radius_km"]
        if intent.get("market_name"):
            args["market_name"] = intent["market_name"]

    if action == "get_prices":
        if intent.get("lookback_days") is not None:
            args["lookback_days"] = intent["lookback_days"]
        else:
            if intent.get("from_date"):
                args["from_date"] = intent["from_date"]
            if intent.get("to_date"):
                args["to_date"] = intent["to_date"]

    return args


async def synthesize_daily_price_answer(query: str, tool_result: Any) -> str:
    """Ask Gemma to turn tool JSON into a farmer-facing English answer."""
    if isinstance(tool_result, (dict, list)):
        tool_text = json.dumps(tool_result, ensure_ascii=False, default=str)
    else:
        tool_text = str(tool_result)
    user_content = (
        f"{DAILY_PRICE_ANSWER_PROMPT}\n\n"
        f"Farmer query: {query}\n\n"
        f"Tool response JSON:\n{tool_text}\n\n"
        "Answer:"
    )
    answer = await _gemma_chat(
        trace_name="daily_price_answer",
        user_content=user_content,
        max_tokens=800,
        temperature=0.2,
        query=query,
    )
    if not answer:
        return ""
    return answer.strip()


class DailyPriceInput(BaseModel):
    query: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    crop: str
    state: Optional[str] = None


@tool(args_schema=DailyPriceInput)
async def daily_price(
    query: str,
    latitude: Optional[float],
    longitude: Optional[float],
    crop: str,
    state: Optional[str] = None,
    config: RunnableConfig = None,
) -> str:
    """
    Query daily mandi / commodity prices near the farmer.
    Use when the user asks for crop market prices, mandi rates, or nearest APMC prices.
    Requires crop name and resolved latitude/longitude when possible.
    """
    try:
        lat = latitude
        lon = longitude
        if (lat is None or lon is None) and state:
            from ajrasakha.agents.location_context import forward_geocode

            geocode_result = await forward_geocode(state=state, district=None)
            if geocode_result and geocode_result.get("latitude") and geocode_result.get("longitude"):
                lat = geocode_result.get("latitude")
                lon = geocode_result.get("longitude")
                logger.info(
                    "daily_price_agent: forward geocoded state %r to %s, %s",
                    state,
                    lat,
                    lon,
                )

        intent = await extract_daily_price_intent(query)
        logger.info("Daily price intent: %s", intent)

        tool_args = _build_tool_args(
            intent,
            lat=lat,
            lon=lon,
            crop=crop,
            state=state,
        )

        if intent["action"] in {"get_prices", "lookup_commodity"} and not tool_args.get("commodity_name"):
            logger.warning("daily_price_agent: missing commodity_name for action=%s", intent["action"])
            return ""

        if intent["action"] in {"get_prices", "search_markets"} and (
            tool_args.get("lat") is None or tool_args.get("long") is None
        ):
            # Allow state-only get_prices / search_markets when geo is unavailable
            if not tool_args.get("state") and not tool_args.get("market_name"):
                logger.warning("daily_price_agent: missing lat/long and state for geo/price query")
                return ""

        tool_result = await call_mandi_price_tool(tool_args)
        if _tool_result_is_empty(tool_result):
            return ""

        answer = await synthesize_daily_price_answer(query, tool_result)
        return answer or ""
    except Exception as exc:
        logger.error("daily_price agent failed: %s", exc, exc_info=True)
        return ""

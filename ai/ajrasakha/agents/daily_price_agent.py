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

DAILY_PRICE_GEMMA_BASE_URL = os.getenv("GEMMA_BASE_URL", "http://100.100.108.44:8013/v1")
DAILY_PRICE_GEMMA_MODEL = os.getenv("GEMMA_MODEL", "google/gemma-4-26B-A4B-it")

_FARMER_ACTIONS = frozenset({
    "get_today_price",
    "get_price_history",
    "get_price_summary",
    "get_highest_price",
    "get_today_arrival",
    "get_arrival_history",
    "get_extreme_arrival",
    "search_markets",
})

_COMMODITY_ACTIONS = frozenset({
    "get_today_price",
    "get_price_history",
    "get_price_summary",
    "get_highest_price",
    "get_today_arrival",
    "get_arrival_history",
    "get_extreme_arrival",
})

_GEO_ACTIONS = frozenset({
    "get_today_price",
    "get_price_history",
    "get_price_summary",
    "get_highest_price",
    "get_today_arrival",
    "get_arrival_history",
    "get_extreme_arrival",
    "search_markets",
})

_HISTORY_ACTIONS = frozenset({
    "get_price_history",
    "get_price_summary",
    "get_highest_price",
    "get_arrival_history",
    "get_extreme_arrival",
})

# Old tool actions → new MCP actions (PR #1017 renamed the surface).
_LEGACY_ACTION_MAP = {
    "get_prices": "get_today_price",
    "lookup_commodity": "get_today_price",
    "get_unresolved_markets": "search_markets",
}

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


def _empty_intent_fields() -> dict[str, Any]:
    return {
        "nearest_market": True,
        "radius_km": None,
        "lookback_days": None,
        "from_date": None,
        "to_date": None,
        "market_name": None,
        "state": None,
        "sort_order": None,
    }


def _heuristic_intent(query: str) -> dict[str, Any]:
    """Fallback intent when Gemma is unavailable."""
    q = (query or "").lower()
    base = _empty_intent_fields()

    if "which market" in q or "nearest market" in q or "mandi near" in q or "find market" in q or "find mandi" in q:
        return {**base, "action": "search_markets", "nearest_market": True, "radius_km": 50}

    if "arrival" in q:
        if "lowest" in q or "least" in q:
            return {**base, "action": "get_extreme_arrival", "sort_order": "lowest", "lookback_days": 7}
        if "highest" in q or "maximum" in q or "most" in q:
            return {**base, "action": "get_extreme_arrival", "sort_order": "highest", "lookback_days": 7}
        if any(k in q for k in ("history", "week", "month", "days", "last ", "past ")):
            lookback = 30 if "month" in q else 7
            return {**base, "action": "get_arrival_history", "lookback_days": lookback}
        return {**base, "action": "get_today_arrival"}

    if any(k in q for k in ("average", "avg", "summary", "min max", "statistics", "stats")):
        lookback = 30 if "month" in q else 7
        return {**base, "action": "get_price_summary", "lookback_days": lookback}

    if any(k in q for k in ("highest price", "maximum price", "max price", "best price", "highest rate")):
        lookback = 30 if "month" in q else 7
        return {**base, "action": "get_highest_price", "lookback_days": lookback}

    if any(k in q for k in ("history", "week", "month", "days", "last ", "past ", "from ", "between")):
        if "month" in q or "30 day" in q:
            lookback = 30
        elif "week" in q or "7 day" in q:
            lookback = 7
        else:
            lookback = 7
        return {**base, "action": "get_price_history", "lookback_days": lookback}

    return {**base, "action": "get_today_price"}


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


def _map_action(action: str) -> str:
    key = (action or "").strip().lower()
    key = _LEGACY_ACTION_MAP.get(key, key)
    if key not in _FARMER_ACTIONS:
        return "get_today_price"
    return key


def _normalize_intent(raw: dict[str, Any] | None, query: str) -> dict[str, Any]:
    base = _heuristic_intent(query)
    if not raw:
        return base
    action = _map_action(str(raw.get("action") or base["action"]))
    # Legacy get_prices with an explicit lookback/range should become history.
    raw_action = str(raw.get("action") or "").strip().lower()
    if raw_action in {"get_prices", "lookup_commodity"} and (
        raw.get("lookback_days") or raw.get("from_date") or raw.get("to_date")
    ):
        action = "get_price_history"

    out = {
        "action": action,
        "nearest_market": bool(raw.get("nearest_market", base.get("nearest_market", True))),
        "radius_km": raw.get("radius_km", base.get("radius_km")),
        "lookback_days": raw.get("lookback_days", base.get("lookback_days")),
        "from_date": raw.get("from_date", base.get("from_date")),
        "to_date": raw.get("to_date", base.get("to_date")),
        "market_name": raw.get("market_name", base.get("market_name")),
        "state": raw.get("state", base.get("state")),
        "sort_order": raw.get("sort_order", base.get("sort_order")),
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
    for key in ("from_date", "to_date", "market_name", "state", "sort_order"):
        val = out.get(key)
        if val is None or str(val).strip().lower() in {"", "null", "none"}:
            out[key] = None
        else:
            out[key] = str(val).strip().lower() if key == "sort_order" else str(val).strip()
    if out["action"] == "get_extreme_arrival" and out["sort_order"] not in {"highest", "lowest"}:
        out["sort_order"] = "highest"
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
            response = await client.post(url, json=payload, headers=headers, timeout=30.0)
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


def _unwrap_tool_payload(result: Any) -> Any:
    """Normalize MCP content wrappers like [{'type':'text','text':'{...}'}]."""
    if isinstance(result, str):
        try:
            return json.loads(result)
        except (json.JSONDecodeError, TypeError):
            return result
    if isinstance(result, list) and result:
        first = result[0]
        if isinstance(first, dict) and isinstance(first.get("text"), str):
            try:
                return json.loads(first["text"])
            except (json.JSONDecodeError, TypeError):
                return first["text"]
    return result


def _tool_result_is_empty(result: Any) -> bool:
    result = _unwrap_tool_payload(result)
    if result is None or result == "":
        return True
    if isinstance(result, str):
        return not result.strip()
    if not isinstance(result, dict):
        return False
    if result.get("error"):
        return True

    list_keys = (
        "price_records",
        "markets",
        "highest_records",
        "arrival_records",
        "highest_arrivals",
        "lowest_arrivals",
    )
    for key in list_keys:
        if key in result:
            return len(result.get(key) or []) == 0

    if "stats" in result:
        stats = result.get("stats")
        return not bool(stats)

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

    if action in _COMMODITY_ACTIONS:
        crop_clean = (crop or "").strip()
        if crop_clean and crop_clean.lower() not in {"all", "any", "general"}:
            args["commodity_name"] = [crop_clean]

    if action in _GEO_ACTIONS:
        if lat is not None and lon is not None:
            args["lat"] = float(lat)
            args["long"] = float(lon)
        args["nearest_market"] = bool(intent.get("nearest_market", True))
        if intent.get("radius_km") is not None:
            args["radius_km"] = intent["radius_km"]
        if intent.get("market_name"):
            args["market_name"] = intent["market_name"]

    if action in _HISTORY_ACTIONS:
        if intent.get("lookback_days") is not None:
            args["lookback_days"] = intent["lookback_days"]
        else:
            if intent.get("from_date"):
                args["from_date"] = intent["from_date"]
            if intent.get("to_date"):
                args["to_date"] = intent["to_date"]

    if action == "get_extreme_arrival" and intent.get("sort_order"):
        args["sort_order"] = intent["sort_order"]

    return args


def _fallback_unavailable_answer(payload: Any, *, crop: str | None = None, state: str | None = None) -> str:
    """Deterministic English reply when Gemma cannot phrase an unavailable result."""
    parts = ["Mandi price data is not available"]
    crop_clean = (crop or "").strip()
    state_clean = (state or "").strip()
    if crop_clean and crop_clean.lower() not in {"all", "any", "general"}:
        parts.append(f"for {crop_clean}")
    if state_clean and state_clean.lower() not in {"all", "not specified", "unknown"}:
        parts.append(f"in {state_clean}")
    parts.append("right now.")
    if isinstance(payload, dict) and payload.get("error"):
        return " ".join(parts)
    return " ".join(parts)


async def synthesize_daily_price_answer(
    query: str,
    tool_result: Any,
    *,
    crop: str | None = None,
    state: str | None = None,
) -> str:
    """Ask Gemma to turn tool JSON into a farmer-facing English answer."""
    payload = _unwrap_tool_payload(tool_result)
    if isinstance(payload, (dict, list)):
        tool_text = json.dumps(payload, ensure_ascii=False, default=str)
    else:
        tool_text = str(payload)
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
    if answer and answer.strip():
        return answer.strip()
    if _tool_result_is_empty(payload):
        return _fallback_unavailable_answer(payload, crop=crop, state=state)
    return ""


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

        if intent["action"] in _COMMODITY_ACTIONS and not tool_args.get("commodity_name"):
            logger.warning("daily_price_agent: missing commodity_name for action=%s", intent["action"])
            return ""

        if intent["action"] in _GEO_ACTIONS and (
            tool_args.get("lat") is None or tool_args.get("long") is None
        ):
            if not tool_args.get("state") and not tool_args.get("market_name"):
                logger.warning("daily_price_agent: missing lat/long and state for geo/price query")
                return ""

        tool_result = await call_mandi_price_tool(tool_args)
        tool_payload = _unwrap_tool_payload(tool_result)
        # Keep raw tool payload on the return envelope for logs only (not used in farmer answer).
        logger.info(
            "daily_price_agent tool_data: %s",
            json.dumps(tool_payload, ensure_ascii=False, default=str)[:8000],
        )

        # Always ask Gemma — including error/empty payloads — so farmers get a clear "not available".
        answer = await synthesize_daily_price_answer(
            query,
            tool_result,
            crop=crop,
            state=tool_args.get("state") or state,
        )
        return json.dumps(
            {"answer": answer or "", "tool_data": tool_payload},
            ensure_ascii=False,
            default=str,
        )
    except Exception as exc:
        logger.error("daily_price agent failed: %s", exc, exc_info=True)
        return json.dumps(
            {
                "answer": _fallback_unavailable_answer({"error": str(exc)}, crop=crop, state=state),
                "tool_data": {"error": str(exc)},
            },
            default=str,
        )

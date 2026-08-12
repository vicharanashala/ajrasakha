# ajrasakha/agents/new_weather_agent.py
# New Weather Agent exposing Tools 1 to 7.

import json
import logging
import os
import re
from typing import Optional, Dict, Any

import httpx
from datetime import datetime, timedelta, date
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from ajrasakha.agents.llm_trace import trace_llm_error, trace_llm_request, trace_llm_response
from ajrasakha.agents.prompts import NEW_WEATHER_ANSWER_PROMPT, NEW_WEATHER_INTENT_PROMPT
from ajrasakha.agents.tool_output_formatters import format_new_weather_tool_dict
from ajrasakha.tools.weather.weather_tools2 import (
    call_current_and_forecast_info,
    call_rainfall_and_monsoon_info,
    call_temperature_info,
    call_location_weather,
    call_weather_nowcast,
    call_weather_alerts,
    call_sowing_weather_guide,
)

logger = logging.getLogger(__name__)

load_dotenv()

from fastmcp import Client

USE_MCP_SERVER = os.getenv("USE_WEATHER_MCP_SERVER", "true").lower() == "true"
WEATHER_MCP_URL = os.getenv("WEATHER_MCP_URL", "http://127.0.0.1:8007/mcp")
# Same Gemma endpoint pattern as market_agent (WEATHER_GEMMA_BASE_URL).
WEATHER_GEMMA_BASE_URL = os.getenv("WEATHER_GEMMA_BASE_URL", "http://100.100.108.44:8014/v1")
WEATHER_INTENT_MODEL = os.getenv("WEATHER_INTENT_MODEL", "google/gemma-4-E4B-it")
WEATHER_ANSWER_MODEL = os.getenv("WEATHER_ANSWER_MODEL", WEATHER_INTENT_MODEL)

_ALLOWED_WEATHER_TOOLS = frozenset({
    "get_weather_alerts",
    "get_weather_nowcast",
    "get_location_weather",
    "get_rainfall_and_monsoon_info",
    "get_temperature_info",
    "get_current_and_forecast_info",
    "get_sowing_weather_guide",
})

_ALLOWED_QUERY_TYPES = frozenset({"today", "forecast", "previous"})
_ALLOWED_SOWING_QUERY_TYPES = frozenset({
    "sowing_time", "weather_for_sowing", "nursery_prep", "season_calendar",
})
_ALLOWED_RAINFALL_DATA_TYPES = frozenset({"current", "forecast", "monsoon_status", "historical"})

async def _invoke_mcp_or_direct(tool_name: str, arguments: dict) -> dict:
    """Call tool via FastMCP Client over HTTP endpoint if active, with direct function fallback."""
    if USE_MCP_SERVER:
        try:
            async with Client(WEATHER_MCP_URL) as client:
                res = await client.call_tool(tool_name, arguments)
                if res and getattr(res, "structured_content", None):
                    return res.structured_content
                elif res and getattr(res, "content", None):
                    for item in res.content:
                        if hasattr(item, "text") and item.text:
                            try:
                                return json.loads(item.text)
                            except Exception:
                                pass
        except Exception as mcp_err:
            logger.warning("FastMCP Server connection to %s failed (%s). Using direct tool execution.", WEATHER_MCP_URL, mcp_err)

    direct_map = {
        "get_weather_alerts": call_weather_alerts,
        "get_weather_nowcast": call_weather_nowcast,
        "get_location_weather": call_location_weather,
        "get_temperature_info": call_temperature_info,
        "get_rainfall_and_monsoon_info": call_rainfall_and_monsoon_info,
        "get_current_and_forecast_info": call_current_and_forecast_info,
        "get_sowing_weather_guide": call_sowing_weather_guide,
    }
    fn = direct_map.get(tool_name, call_current_and_forecast_info)
    return await fn(**arguments)


_ALERTS_KEYWORDS = [
    "warning", "warnings", "alert", "alerts", "danger", "cyclone", "toofan", 
    "khatara", "storm warning", "red alert", "orange alert", "yellow alert", 
    "heavy rain warning", "tsunami", "severe weather"
]

_NOWCAST_HOUR_NUM = r"(?:few|0-3|1-2|1-3|2-3|1|2|3|one|two|three)"

_NOWCAST_KEYWORDS = [
    "nowcast", "right now", "currently", "current weather", "present weather",
    "abhi", "turant", "short term", "immediate",
    "next 1 hour", "next 2 hour", "next 3 hour",
    "next one hour", "next two hour", "next three hour",
    "next 1 hrs", "next 2 hrs", "next 3 hrs",
    "next one hrs", "next two hrs", "next three hrs",
    "next 1-2 hours", "next 2-3 hours", "next 1-3 hours",
    "next 1-2 hrs", "next 2-3 hrs", "next 1-3 hrs",
    "for the next 1 hour", "for the next 2 hours", "for the next 3 hours",
    "for the next one hour", "for the next two hours", "for the next three hours",
    "for the next 1 hr", "for the next 2 hrs", "for the next 3 hrs",
    "for next 1 hr", "for next 2 hrs", "for next 3 hrs",
    "in next 1 hr", "in next 2 hrs", "in next 3 hrs",
    "coming 1 hour", "coming 2 hours", "coming 3 hours",
    "coming one hour", "coming two hours", "coming three hours",
    "coming 1 hr", "coming 2 hrs", "coming 3 hrs",
    "next 2-3", "next 1-3",
    "in 1 hour", "in 2 hours", "in 3 hours",
    "in one hour", "in two hours", "in three hours",
    "in 1 hr", "in 2 hrs", "in 3 hrs",
    "next few hours", "coming few hours",
]

_NOWCAST_RE = re.compile(
    r"\b(nowcast|right now|currently|current weather|present weather|abhi|turant|short term|immediate|"
    r"(for|in|over)\s+(the\s+)?next\s+" + _NOWCAST_HOUR_NUM + r"\s*(hours?|hrs?|h)\b|"
    r"(next|coming|in|for the next|for next|over the next)\s+" + _NOWCAST_HOUR_NUM + r"\s*(hours?|hrs?|h)\b|"
    r"next\s*" + _NOWCAST_HOUR_NUM + r"\s*(hours?|hrs?|h)|"
    r"(1|2|3|one|two|three)\s*(hours?|hrs?)\s*(prediction|forecast|weather|nowcast|rain|rainfall))",
    re.IGNORECASE,
)

_LOCATION_KEYWORDS = [
    "block", "tahsil", "tehsil", "mandal", "panchayat", "village", 
    "nearby station", "nearby stations", "stations within 50km", 
    "station within 50km", "50km radius", "50 km", "radius"
]

_TEMP_KEYWORDS = [
    "temperature", "temperatures", "temp", "cold", "heat", "garmi", "thanda", 
    "frost", "humidity", "feel like", "feels like", "celsius", "degree", 
    "heatwave", "coldwave"
]

_RAINFALL_KEYWORDS = [
    "rain", "rainfall", "barish", "baarish", "monsoon", "precipitation", 
    "deficient rain", "excess rain", "how much rain", "past 24 hours rain",
    "rain condition", "rainfall condition", "rain prediction", "rainfall status"
]

_SOWING_KEYWORDS = [
    "sowing", "sow", "planting", "plant timing", "when to plant", "when to sow",
    "nursery prep", "nursery preparation", "seedbed", "transplanting time",
    "sowing time", "sowing window", "planting window", "season calendar",
    "weather for sowing", "suitable for sowing", "good for sowing",
]


def route_weather_query_by_heuristics(query: str) -> str:
    """Keyword & pattern-based intent routing to one of the 7 specialized IMD weather tools."""
    q = query.lower()
    
    # 1. Tool 6: get_weather_alerts (Severe Warnings & Red/Orange/Yellow Alerts)
    if any(k in q for k in _ALERTS_KEYWORDS):
        return "get_weather_alerts"
        
    # 2. Tool 5: get_weather_nowcast (Short-term 0-3 Hour Predictions - ONLY if short-term/nowcast timeframe)
    is_multiday = any(w in q for w in ["tomorrow", "tomorrows", "next week", "next 5 days", "next 7 days", "past", "yesterday", "august", "july", "september", "october", "november", "december", "january", "february", "march", "april", "may", "june"])
    if not is_multiday and (_NOWCAST_RE.search(q) or any(k in q for k in _NOWCAST_KEYWORDS)):
        return "get_weather_nowcast"
        
    # 3. Tool 4: get_location_weather (Hyper-local Block/Village Weather & 50km Nearby AWS Stations)
    if any(k in q for k in _LOCATION_KEYWORDS):
        return "get_location_weather"

    # 4. Tool 7: get_sowing_weather_guide (Sowing / planting / nursery weather advice)
    if any(k in q for k in _SOWING_KEYWORDS):
        return "get_sowing_weather_guide"

    # 5. Tool 2: get_rainfall_and_monsoon_info (Rainfall Stats, Departures & Monsoon Progress)
    if any(k in q for k in _RAINFALL_KEYWORDS):
        return "get_rainfall_and_monsoon_info"

    # 6. Tool 3: get_temperature_info (Temperature, Humidity %, Feel-like & Hot/Cold status)
    if any(k in q for k in _TEMP_KEYWORDS):
        return "get_temperature_info"

    # 7. Tool 1: get_current_and_forecast_info (General Weather & Multi-day 5-7 Day Forecast - Default Fallback)
    return "get_current_and_forecast_info"


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


def _past_days_to_range(past_days: int | None) -> tuple[str | None, str | None]:
    if past_days is None:
        return None, None
    try:
        n = int(past_days)
    except (TypeError, ValueError):
        return None, None
    if n < 1:
        return None, None
    n = min(n, 30)
    today_d = date.today()
    from_d = (today_d - timedelta(days=n - 1)).strftime("%Y-%m-%d")
    to_d = today_d.strftime("%Y-%m-%d")
    return from_d, to_d


def _heuristic_weather_intent(query: str) -> dict[str, Any]:
    """Programmatic fallback when Gemma is unavailable or returns invalid JSON."""
    tool_name = route_weather_query_by_heuristics(query)
    ext_target, ext_from, ext_to, ext_qt = _extract_dates_from_text(query)
    q_lower = (query or "").lower()

    past_days = None
    p_match = re.search(
        r"\b(?:past|last)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:days?|dyas)\b",
        q_lower,
    )
    if p_match and not re.search(r"\bpast\s+24\s*(?:hours?|hrs?)\b", q_lower):
        num_words = {
            "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        }
        val_s = p_match.group(1)
        past_days = num_words.get(val_s, int(val_s) if val_s.isdigit() else None)

    forecast_days = None
    if "7 day" in q_lower or "7-day" in q_lower or "week" in q_lower:
        forecast_days = 7
    elif "5 day" in q_lower or "5-day" in q_lower:
        forecast_days = 5
    elif "3 day" in q_lower or "3-day" in q_lower:
        forecast_days = 3
    elif "forecast" in q_lower:
        forecast_days = 5

    hours_ahead = None
    h_match = re.search(r"\b(?:next|coming|in)\s*(1|2|3|one|two|three)\s*(?:hours?|hrs?|h)\b", q_lower)
    if h_match:
        hw = {"one": 1, "two": 2, "three": 3}
        hs = h_match.group(1)
        hours_ahead = hw.get(hs, int(hs) if hs.isdigit() else 3)

    want_nearby = any(k in q_lower for k in ["nearby", "station", "stations", "radius", "50km", "nearest"])
    data_type = None
    if tool_name == "get_rainfall_and_monsoon_info":
        if "monsoon" in q_lower:
            data_type = "monsoon_status"
        elif "forecast" in q_lower:
            data_type = "forecast"
        elif ext_from or ext_qt == "previous" or past_days:
            data_type = "historical"
        else:
            data_type = "current"

    query_type = ext_qt
    if tool_name == "get_sowing_weather_guide":
        if "nursery" in q_lower or "seedbed" in q_lower:
            query_type = "nursery_prep"
        elif "season calendar" in q_lower or "sowing calendar" in q_lower or "planting calendar" in q_lower:
            query_type = "season_calendar"
        elif "weather for sowing" in q_lower or "suitable for sowing" in q_lower or "good for sowing" in q_lower:
            query_type = "weather_for_sowing"
        else:
            query_type = "sowing_time"
    elif not query_type:
        if "forecast" in q_lower or (forecast_days and forecast_days > 1):
            query_type = "forecast"
        elif "previous" in q_lower or "past" in q_lower or past_days:
            if not re.search(r"\bpast\s+24\s*(?:hours?|hrs?)\b", q_lower):
                query_type = "previous"
        else:
            query_type = "today"

    return {
        "tool": tool_name,
        "query_type": query_type,
        "data_type": data_type,
        "target_date": ext_target,
        "from_date": ext_from,
        "to_date": ext_to,
        "past_days": past_days,
        "forecast_days": forecast_days,
        "hours_ahead": hours_ahead if tool_name == "get_weather_nowcast" else None,
        "include_nearby_stations": want_nearby if tool_name in {"get_weather_nowcast", "get_location_weather"} else None,
        "radius_km": 50.0 if want_nearby else None,
        "crop_name": None,
        "source": "heuristic",
    }


def _normalize_weather_intent(raw: dict[str, Any] | None, query: str) -> dict[str, Any]:
    base = _heuristic_weather_intent(query)
    if not raw:
        return base

    tool = str(raw.get("tool") or "").strip()
    if tool not in _ALLOWED_WEATHER_TOOLS:
        tool = base["tool"]

    query_type = raw.get("query_type", base.get("query_type"))
    if query_type is not None:
        query_type = str(query_type).strip().lower()
        if query_type in {"", "null", "none"}:
            query_type = None
        elif tool == "get_sowing_weather_guide":
            if query_type not in _ALLOWED_SOWING_QUERY_TYPES:
                query_type = base.get("query_type") if base.get("query_type") in _ALLOWED_SOWING_QUERY_TYPES else "sowing_time"
        elif query_type not in _ALLOWED_QUERY_TYPES:
            query_type = base.get("query_type")

    data_type = raw.get("data_type", base.get("data_type"))
    if data_type is not None:
        data_type = str(data_type).strip().lower()
        if data_type in {"", "null", "none"}:
            data_type = None
        elif data_type not in _ALLOWED_RAINFALL_DATA_TYPES:
            data_type = base.get("data_type")

    crop_name = raw.get("crop_name", base.get("crop_name"))
    if crop_name is not None:
        crop_name = str(crop_name).strip()
        if crop_name.lower() in {"", "null", "none"}:
            crop_name = None
    if tool != "get_sowing_weather_guide":
        crop_name = None
    elif not crop_name:
        crop_name = base.get("crop_name")

    def _clean_date(val: Any, fallback: str | None) -> str | None:
        if val is None or str(val).strip().lower() in {"", "null", "none"}:
            return fallback
        s = str(val).strip().replace("/", "-")
        # Accept YYYY-MM-DD only; otherwise keep fallback / programmatic extract.
        if re.fullmatch(r"20\d{2}-\d{2}-\d{2}", s):
            return s
        return fallback

    past_days = raw.get("past_days", base.get("past_days"))
    try:
        past_days = int(past_days) if past_days is not None and str(past_days).strip() != "" else None
    except (TypeError, ValueError):
        past_days = base.get("past_days")

    forecast_days = raw.get("forecast_days", base.get("forecast_days"))
    try:
        forecast_days = int(forecast_days) if forecast_days is not None and str(forecast_days).strip() != "" else None
        if forecast_days is not None:
            forecast_days = max(1, min(7, forecast_days))
    except (TypeError, ValueError):
        forecast_days = base.get("forecast_days")

    hours_ahead = raw.get("hours_ahead", base.get("hours_ahead"))
    try:
        hours_ahead = int(hours_ahead) if hours_ahead is not None and str(hours_ahead).strip() != "" else None
        if hours_ahead is not None:
            hours_ahead = max(1, min(3, hours_ahead))
    except (TypeError, ValueError):
        hours_ahead = base.get("hours_ahead")

    include_nearby = raw.get("include_nearby_stations", base.get("include_nearby_stations"))
    if include_nearby is None:
        include_nearby = base.get("include_nearby_stations")
    else:
        include_nearby = bool(include_nearby)

    radius_km = raw.get("radius_km", base.get("radius_km"))
    try:
        radius_km = float(radius_km) if radius_km is not None and str(radius_km).strip() != "" else None
    except (TypeError, ValueError):
        radius_km = base.get("radius_km")

    target_date = _clean_date(raw.get("target_date"), base.get("target_date"))
    from_date = _clean_date(raw.get("from_date"), base.get("from_date"))
    to_date = _clean_date(raw.get("to_date"), base.get("to_date"))

    # Materialize past_days into from/to when Gemma gave a lookback but no explicit dates.
    if past_days and not from_date and not target_date and tool != "get_sowing_weather_guide":
        from_date, to_date = _past_days_to_range(past_days)
        query_type = query_type or "previous"
        if tool == "get_rainfall_and_monsoon_info" and not data_type:
            data_type = "historical"

    out = {
        "tool": tool,
        "query_type": query_type or base.get("query_type"),
        "data_type": data_type if tool == "get_rainfall_and_monsoon_info" else None,
        "target_date": target_date,
        "from_date": from_date,
        "to_date": to_date,
        "past_days": past_days,
        "forecast_days": forecast_days,
        "hours_ahead": hours_ahead if tool == "get_weather_nowcast" else None,
        "include_nearby_stations": include_nearby if tool in {"get_weather_nowcast", "get_location_weather"} else None,
        "radius_km": radius_km if tool in {"get_weather_nowcast", "get_location_weather"} else None,
        "crop_name": crop_name if tool == "get_sowing_weather_guide" else None,
        "source": "gemma",
    }
    return out


async def _gemma_weather_chat(
    *,
    trace_name: str,
    user_content: str,
    max_tokens: int = 400,
    temperature: float = 0.0,
    query: str | None = None,
    model: str | None = None,
    timeout: float = 10.0,
) -> str | None:
    model_name = model or WEATHER_INTENT_MODEL
    trace_llm_request(
        trace_name,
        model=model_name,
        messages=[HumanMessage(content=user_content)],
        query=query,
        api_base=WEATHER_GEMMA_BASE_URL,
    )
    url = f"{WEATHER_GEMMA_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": user_content}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {"Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=timeout)
            if response.status_code != 200:
                trace_llm_error(
                    trace_name,
                    error=f"HTTP {response.status_code}",
                    response_preview=response.text[:500],
                )
                return None
            result = response.json()
            message = result["choices"][0]["message"]
            content = (message.get("content") or "").strip()
            reasoning = (message.get("reasoning") or "").strip()
            raw = content or reasoning
            # Gemma sometimes puts JSON only in reasoning; combine like market_agent.
            if content and reasoning and "{" not in content and "{" in reasoning:
                raw = f"{content}\n{reasoning}"
            elif not content and reasoning:
                raw = reasoning
            trace_llm_response(trace_name, output=raw, source="gemma")
            return raw
    except Exception as exc:
        logger.warning("Gemma %s failed: %s", trace_name, exc)
        trace_llm_error(trace_name, error=f"{type(exc).__name__}: {exc}")
        return None


def _weather_tool_unavailable_answer(payload: Any) -> str:
    place = None
    if isinstance(payload, dict):
        place = payload.get("resolved_location") or payload.get("district") or payload.get("location")
    if place:
        return f"Weather data is not available for {place} right now."
    return "Weather data is not available for that place or time right now."


def _weather_tool_has_usable_data(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    if payload.get("success") is False:
        return False
    if payload.get("error"):
        return False
    skip = {
        "success", "error", "tool", "query_type", "data_type", "language",
        "lat", "long", "longitude", "latitude",
    }
    for key, val in payload.items():
        if key in skip:
            continue
        if val is None or val == "" or val == [] or val == {}:
            continue
        return True
    return False


def _extract_weather_answer_facts(text: str) -> set[str]:
    """Pull stable fact tokens from formatted weather text for completeness checks."""
    facts: set[str] = set()
    if not text:
        return facts
    for match in re.findall(r"\b\d+(?:\.\d+)?\b", text):
        facts.add(match)
    for match in re.findall(r"[A-Z][A-Z0-9_]{2,}", text):
        facts.add(match)
    for phrase in (
        "Mist", "Clear Sky", "Green", "Red", "Orange", "Yellow",
        "Humidity", "Temperature", "Feels like", "Rain 24h", "Nowcast",
        "Nearest AWS", "Live observation", "Nearest station info",
    ):
        if phrase.lower() in text.lower():
            facts.add(phrase.lower())
    return facts


def _weather_answer_preserves_facts(source: str, candidate: str) -> bool:
    """True when Gemma output still contains the key facts from the full server brief."""
    if not candidate or not candidate.strip():
        return False
    source_facts = _extract_weather_answer_facts(source)
    if not source_facts:
        return True
    cand_lower = candidate.lower()
    present = sum(1 for fact in source_facts if fact.lower() in cand_lower)
    # Require most numeric tokens and named markers from the deterministic brief.
    return present >= max(3, int(len(source_facts) * 0.7))


def build_full_weather_answer(tool_result: Any) -> str:
    """Build the complete farmer-facing answer from server JSON only."""
    if not isinstance(tool_result, dict) or not _weather_tool_has_usable_data(tool_result):
        return ""
    try:
        formatted = format_new_weather_tool_dict(tool_result)
    except Exception as fmt_err:
        logger.warning("Weather deterministic formatter failed: %s", fmt_err)
        return ""
    return formatted.strip() if formatted and formatted.strip() else ""


async def synthesize_weather_answer(query: str, tool_result: Any) -> str:
    """Return a complete bullet-style answer from server JSON; Gemma may only rephrase."""
    full_answer = build_full_weather_answer(tool_result)
    if not full_answer:
        return _weather_tool_unavailable_answer(tool_result)

    user_content = (
        f"{NEW_WEATHER_ANSWER_PROMPT}\n\n"
        f"Farmer query: {query}\n\n"
        "Complete weather brief from server (include EVERY fact below; do not omit any line or value):\n"
        f"{full_answer}\n\n"
        "Answer:"
    )
    answer = await _gemma_weather_chat(
        trace_name="new_weather_answer",
        user_content=user_content,
        max_tokens=2000,
        temperature=0.0,
        query=query,
        model=WEATHER_ANSWER_MODEL,
        timeout=45.0,
    )
    if answer and answer.strip() and _weather_answer_preserves_facts(full_answer, answer):
        return answer.strip()

    if answer and answer.strip():
        logger.info(
            "Gemma weather answer dropped facts; using full deterministic formatter output."
        )
    return full_answer


async def extract_weather_intent(query: str) -> dict[str, Any]:
    """Ask Gemma for tool + params; fall back to programmatic heuristics on failure."""
    today_str = date.today().strftime("%Y-%m-%d")
    user_content = (
        f"{NEW_WEATHER_INTENT_PROMPT}\n\n"
        f"Today: {today_str}\n"
        f"Query: {query}\n"
        "JSON:"
    )
    raw_text = await _gemma_weather_chat(
        trace_name="new_weather_intent",
        user_content=user_content,
        max_tokens=400,
        temperature=0.0,
        query=query,
        model=WEATHER_INTENT_MODEL,
        timeout=10.0,
    )
    parsed = _extract_json_object(raw_text or "")
    intent = _normalize_weather_intent(parsed, query)
    if parsed is None:
        intent["source"] = "heuristic"
        trace_llm_response(
            "new_weather_intent",
            output=json.dumps(intent),
            source="heuristic_fallback",
            query=query,
        )
    return intent


class NewWeatherInput(BaseModel):
    query: str = Field(..., description="The user's weather query text.")
    district: Optional[str] = Field(None, description="District name (e.g. Ernakulam, Karnal).")
    state: Optional[str] = Field(None, description="State name (e.g. Kerala, Haryana).")
    location: Optional[str] = Field(None, description="Block, village, or specific sub-location name.")
    latitude: Optional[float] = Field(None, description="Optional latitude float.")
    longitude: Optional[float] = Field(None, description="Optional longitude float.")
    address: Optional[str] = Field(None, description="Optional full location address string.")
    target_date: Optional[str] = Field(None, description="Target date in YYYY-MM-DD format if querying a specific date.")
    from_date: Optional[str] = Field(None, description="Start date in YYYY-MM-DD format for historical date ranges.")
    to_date: Optional[str] = Field(None, description="End date in YYYY-MM-DD format for historical date ranges.")


def _extract_dates_from_text(query: str) -> tuple[str | None, str | None, str | None, str | None]:
    """
    Extract (target_date, from_date, to_date, query_type) from user query text.
    Supports ISO (2026-08-15), DD/MM/YYYY, '15th August', 'August 15', 'yesterday', 'tomorrow', 'next week', 'after 2 weeks', 'past 3 days', etc.
    """
    q = query.lower()
    today = date.today()
    today_str = today.strftime("%Y-%m-%d")

    # ISO format YYYY-MM-DD
    iso_matches = re.findall(r"\b(20\d\d[-/]\d{1,2}[-/]\d{1,2})\b", q)
    if len(iso_matches) >= 2:
        d1 = iso_matches[0].replace("/", "-")
        d2 = iso_matches[1].replace("/", "-")
        return None, d1, d2, "previous" if d1 < today_str else "forecast"
    elif len(iso_matches) == 1:
        d = iso_matches[0].replace("/", "-")
        return d, None, None, "previous" if d < today_str else "forecast"

    # DD/MM/YYYY or DD-MM-YYYY
    dm_matches = re.findall(r"\b(\d{1,2})[-/](\d{1,2})[-/](20\d\d)\b", q)
    if dm_matches:
        day_v, m_v, y_v = dm_matches[0]
        d_str = f"{y_v}-{int(m_v):02d}-{int(day_v):02d}"
        return d_str, None, None, "previous" if d_str < today_str else "forecast"

    months = {
        "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
        "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
        "aug": 8, "august": 8, "sep": 9, "september": 9, "oct": 10, "october": 10,
        "nov": 11, "november": 11, "dec": 12, "december": 12
    }
    month_names_or = "|".join(months.keys())

    # Range format: "7/August to 9/august", "7 August to 9 august", "7 to 9 august", "7-9 august", "from 7 to 9 august"
    r_range1 = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?(?:\/|\s+)?(" + month_names_or + r")?\s*(?:to|-|until|through|and)\s*(\d{1,2})(?:st|nd|rd|th)?(?:\/|\s+)?(" + month_names_or + r")\b", q)
    if r_range1:
        d1, m1, d2, m2 = r_range1.group(1), r_range1.group(2), r_range1.group(3), r_range1.group(4)
        m_name = m2 or m1
        if m_name in months:
            m_num = months[m_name]
            yr = today.year
            f_str = f"{yr}-{m_num:02d}-{int(d1):02d}"
            t_str = f"{yr}-{m_num:02d}-{int(d2):02d}"
            if f_str <= t_str:
                return None, f_str, t_str, "previous" if f_str < today_str else "forecast"

    # Discrete list format: "7,8, 9 august", "7, 8, 9 august", "7, 8 and 9 august"
    r_list = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?\s*,\s*(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:,|and)\s*(\d{1,2})(?:st|nd|rd|th)?)?\s*(" + month_names_or + r")\b", q)
    if r_list:
        d1 = r_list.group(1)
        d_last = r_list.group(3) or r_list.group(2)
        m_name = r_list.group(4)
        m_num = months[m_name]
        yr = today.year
        f_str = f"{yr}-{m_num:02d}-{int(d1):02d}"
        t_str = f"{yr}-{m_num:02d}-{int(d_last):02d}"
        if f_str <= t_str:
            return None, f_str, t_str, "previous" if f_str < today_str else "forecast"

    m_regex = r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(" + month_names_or + r")\b"
    m_match = re.search(m_regex, q)
    if not m_match:
        m_regex2 = r"\b(" + month_names_or + r")\s+(\d{1,2})(?:st|nd|rd|th)?\b"
        m_match2 = re.search(m_regex2, q)
        if m_match2:
            m_name, day_val = m_match2.group(1), m_match2.group(2)
            m_num = months[m_name]
            yr = today.year
            d_str = f"{yr}-{m_num:02d}-{int(day_val):02d}"
            return d_str, None, None, "previous" if d_str < today_str else "forecast"
    else:
        day_val, m_name = m_match.group(1), m_match.group(2)
        m_num = months[m_name]
        yr = today.year
        d_str = f"{yr}-{m_num:02d}-{int(day_val):02d}"
        return d_str, None, None, "previous" if d_str < today_str else "forecast"

    # Relative days
    if "yesterday" in q:
        d_str = (today - timedelta(days=1)).strftime("%Y-%m-%d")
        return d_str, None, None, "previous"
    if "tomorrow" in q and "day after" not in q:
        d_str = (today + timedelta(days=1)).strftime("%Y-%m-%d")
        return d_str, None, None, "forecast"
    if "day after tomorrow" in q:
        d_str = (today + timedelta(days=2)).strftime("%Y-%m-%d")
        return d_str, None, None, "forecast"

    num_words = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10
    }

    # Future range matching: "next 3 days", "next two days", "coming 3 days"
    f_range_match = re.search(r"\b(?:in\s+|for\s+|over\s+)?(?:the\s+)?(?:next|coming)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:days|dyas|day)\b", q)
    if f_range_match:
        val_s = f_range_match.group(1)
        cnt_d = num_words.get(val_s, int(val_s) if val_s.isdigit() else 1)
        f_str = today_str
        t_str = (today + timedelta(days=cnt_d - 1)).strftime("%Y-%m-%d")
        return None, f_str, t_str, "forecast"

    # Past range matching: "past 3 days", "past two days", "last 3 days", "last two days"
    p_range_match = re.search(r"\b(?:past|last)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:days|dyas|day)\b", q)
    if p_range_match:
        val_s = p_range_match.group(1)
        cnt_d = num_words.get(val_s, int(val_s) if val_s.isdigit() else 1)
        f_str = (today - timedelta(days=cnt_d - 1)).strftime("%Y-%m-%d")
        t_str = today_str
        return None, f_str, t_str, "previous"

    if "next week" in q or "after 1 week" in q or "in 1 week" in q:
        d_str = (today + timedelta(days=7)).strftime("%Y-%m-%d")
        return d_str, None, None, "forecast"
    if "after 2 weeks" in q or "in 2 weeks" in q or "2 weeks" in q:
        d_str = (today + timedelta(days=14)).strftime("%Y-%m-%d")
        return d_str, None, None, "forecast"
    if "last week" in q or "previous week" in q or "past week" in q:
        f_str = (today - timedelta(days=6)).strftime("%Y-%m-%d")
        t_str = today_str
        return None, f_str, t_str, "previous"

    # Bare past/previous/historical weather/data with no day count → last 7 days
    if re.search(
        r"\b(?:past|previous|historical)\b.{0,40}\b(?:weather|data|history|record|records|condition|conditions)\b"
        r"|\b(?:weather|data|history|record|records)\b.{0,40}\b(?:past|previous|historical)\b",
        q,
    ):
        f_str = (today - timedelta(days=6)).strftime("%Y-%m-%d")
        t_str = today_str
        return None, f_str, t_str, "previous"

    return None, None, None, None


_INDIAN_STATES = {
    "kerala", "tamil nadu", "karnataka", "andhra pradesh", "telangana", 
    "maharashtra", "gujarat", "punjab", "haryana", "uttar pradesh", "bihar", 
    "west bengal", "odisha", "rajasthan", "madhya pradesh", "assam", "goa", 
    "himachal pradesh", "uttarakhand", "jharkhand", "chhattisgarh", "tripura", 
    "meghalaya", "manipur", "nagaland", "mizoram", "sikkim", "arunachal pradesh", 
    "delhi", "jammu and kashmir", "jammu & kashmir", "ladakh", "puducherry", 
    "andaman and nicobar", "andaman & nicobar", "chandigarh", "dadra and nagar haveli", 
    "daman and diu", "lakshadweep"
}


@tool(args_schema=NewWeatherInput)
async def new_weather(
    query: str,
    district: Optional[str] = None,
    state: Optional[str] = None,
    location: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    address: Optional[str] = None,
    target_date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    config: RunnableConfig = None,
) -> str:
    """
    Query the cluster-based weather agent (Tools 1 to 7).
    """
    try:
        lat = latitude
        lon = longitude
        place_district = district or address
        place_state = state
        place_location = location

        # Handle State-level queries (e.g. "Kerala")
        if place_district and place_district.lower().strip() in _INDIAN_STATES:
            place_state = place_district.strip()
            place_district = None
            place_location = None
            lat = None
            lon = None
        elif place_location and place_location.lower().strip() in _INDIAN_STATES:
            place_state = place_location.strip()
            place_location = None
            place_district = None
            lat = None
            lon = None
        elif place_state and place_state.lower().strip() in _INDIAN_STATES and not place_district and not place_location:
            lat = None
            lon = None

        # Extract dates from query text if omitted (programmatic baseline).
        # Gemma intent (below) may override/refine these.
        ext_target, ext_from, ext_to, ext_qt = _extract_dates_from_text(query)
        eff_target_date = target_date or ext_target
        eff_from_date = from_date or ext_from
        eff_to_date = to_date or ext_to

        # If query is past/previous weather/data but still has no range, default to last 7 days.
        # Avoid forcing 7 days for phrases like "past 24 hours rain".
        q_lower = query.lower()
        looks_past_weather = bool(ext_qt == "previous") or bool(
            re.search(
                r"\b(?:past|previous|historical)\b.{0,40}\b(?:weather|data|history|record|records)\b"
                r"|\b(?:weather|data|history)\b.{0,40}\b(?:past|previous|historical)\b",
                q_lower,
            )
        )
        if re.search(r"\bpast\s+24\s*(?:hours?|hrs?)\b", q_lower):
            looks_past_weather = False
        if looks_past_weather and not eff_target_date and not eff_from_date:
            today_d = date.today()
            eff_from_date = (today_d - timedelta(days=6)).strftime("%Y-%m-%d")
            eff_to_date = today_d.strftime("%Y-%m-%d")
            ext_qt = ext_qt or "previous"

        # Geocode if coordinates omitted (district/location/state)
        if (lat is None or lon is None) and (place_district or place_location or place_state):
            try:
                from ajrasakha.agents.location_context import forward_geocode
                geocode_result = await forward_geocode(
                    state=place_state,
                    district=place_district or place_location or place_state,
                )
                if geocode_result and geocode_result.get("latitude") and geocode_result.get("longitude"):
                    lat = geocode_result.get("latitude")
                    lon = geocode_result.get("longitude")
                    logger.info(
                        "new_weather_agent: forward geocoded location %r to %s, %s",
                        place_district or place_location or place_state,
                        lat,
                        lon,
                    )
            except Exception as geo_err:
                logger.warning("Geocoding lookup notice: %s", geo_err)

        # Gemma-first tool + variable extraction; programmatic heuristics on failure.
        intent = await extract_weather_intent(query)
        tool_name = intent.get("tool") or route_weather_query_by_heuristics(query)

        # Prefer explicit tool args, then Gemma, then programmatic extracts.
        if not target_date and intent.get("target_date"):
            eff_target_date = intent["target_date"]
        if not from_date and intent.get("from_date"):
            eff_from_date = intent["from_date"]
        if not to_date and intent.get("to_date"):
            eff_to_date = intent["to_date"]
        if intent.get("past_days") and not from_date and not eff_from_date and not eff_target_date:
            pd_from, pd_to = _past_days_to_range(intent["past_days"])
            if pd_from:
                eff_from_date, eff_to_date = pd_from, pd_to
                ext_qt = ext_qt or "previous"

        eff_qt = intent.get("query_type") or ext_qt
        eff_data_type = intent.get("data_type")
        eff_forecast_days = intent.get("forecast_days")
        eff_hours_ahead = intent.get("hours_ahead") or 3
        want_nearby = bool(intent.get("include_nearby_stations"))
        if intent.get("include_nearby_stations") is None:
            want_nearby = any(k in q_lower for k in ["nearby", "station", "stations", "radius", "50km", "nearest"])
        radius_km = intent.get("radius_km") if intent.get("radius_km") is not None else 50.0

        logger.info(
            "new_weather_agent routed query %r to tool %s via %s "
            "(district: %s, state: %s, target_date: %s, from: %s, to: %s, past_days: %s)",
            query,
            tool_name,
            intent.get("source"),
            place_district,
            place_state,
            eff_target_date,
            eff_from_date,
            eff_to_date,
            intent.get("past_days"),
        )

        # Call the selected active tool via FastMCP Server client
        if tool_name == "get_weather_alerts":
            args = {"lat": lat, "long": lon, "location": place_location, "district": place_district, "state": place_state}
            result = await _invoke_mcp_or_direct("get_weather_alerts", args)
        elif tool_name == "get_weather_nowcast":
            args = {
                "lat": lat,
                "long": lon,
                "location": place_location,
                "district": place_district,
                "state": place_state,
                "hours_ahead": eff_hours_ahead,
                "include_nearby_stations": want_nearby,
                "radius_km": radius_km,
            }
            result = await _invoke_mcp_or_direct("get_weather_nowcast", args)
        elif tool_name == "get_location_weather":
            args = {
                "lat": lat,
                "long": lon,
                "location": place_location,
                "district": place_district,
                "state": place_state,
                "radius_km": radius_km,
                "max_stations": 5,
                "include_nearby_stations": want_nearby,
            }
            result = await _invoke_mcp_or_direct("get_location_weather", args)
        elif tool_name == "get_temperature_info":
            qt = eff_qt or ("forecast" if "forecast" in q_lower else ("previous" if ("previous" in q_lower or "past" in q_lower) else "today"))
            args = {
                "lat": lat,
                "long": lon,
                "location": place_location,
                "district": place_district,
                "state": place_state,
                "query_type": qt,
                "target_date": eff_target_date,
                "from_date": eff_from_date,
                "to_date": eff_to_date,
                "forecast_days": eff_forecast_days or 1,
            }
            result = await _invoke_mcp_or_direct("get_temperature_info", args)
        elif tool_name == "get_rainfall_and_monsoon_info":
            dt = eff_data_type or (
                "monsoon_status" if "monsoon" in q_lower
                else ("forecast" if "forecast" in q_lower
                      else ("historical" if (eff_from_date or eff_qt == "previous") else "current"))
            )
            args = {
                "lat": lat,
                "long": lon,
                "location": place_location,
                "district": place_district,
                "state": place_state,
                "data_type": dt,
                "target_date": eff_target_date,
                "from_date": eff_from_date,
                "to_date": eff_to_date,
                "forecast_days": eff_forecast_days or 1,
            }
            result = await _invoke_mcp_or_direct("get_rainfall_and_monsoon_info", args)
        elif tool_name == "get_sowing_weather_guide":
            sowing_qt = eff_qt if eff_qt in _ALLOWED_SOWING_QUERY_TYPES else "sowing_time"
            args = {
                "lat": lat,
                "long": lon,
                "location": place_location,
                "district": place_district,
                "state": place_state,
                "crop_name": intent.get("crop_name"),
                "query_type": sowing_qt,
            }
            result = await _invoke_mcp_or_direct("get_sowing_weather_guide", args)
        else:
            qt = eff_qt or ("forecast" if "forecast" in q_lower else ("previous" if ("previous" in q_lower or "past" in q_lower) else "today"))
            f_days = eff_forecast_days or 1
            if not eff_forecast_days:
                if "7 day" in q_lower or "7-day" in q_lower or "week" in q_lower:
                    f_days = 7
                elif "5 day" in q_lower or "5-day" in q_lower or "forecast" in q_lower:
                    f_days = 5
                elif "3 day" in q_lower or "3-day" in q_lower:
                    f_days = 3
            args = {
                "lat": lat,
                "long": lon,
                "location": place_location,
                "district": place_district,
                "state": place_state,
                "query_type": qt,
                "target_date": eff_target_date,
                "from_date": eff_from_date,
                "to_date": eff_to_date,
                "forecast_days": f_days,
            }
            result = await _invoke_mcp_or_direct("get_current_and_forecast_info", args)

        logger.info(
            "new_weather_agent tool_data: %s",
            json.dumps(result, ensure_ascii=False, default=str)[:8000],
        )
        answer = await synthesize_weather_answer(query, result)
        return json.dumps(
            {"answer": answer or "", "tool_data": result},
            ensure_ascii=False,
            default=str,
        )

    except Exception as exc:
        logger.error("new_weather_agent execution error: %s", exc, exc_info=True)
        return json.dumps(
            {
                "answer": _weather_tool_unavailable_answer({"error": str(exc)}),
                "tool_data": {"success": False, "error": str(exc)},
            },
            ensure_ascii=False,
            default=str,
        )




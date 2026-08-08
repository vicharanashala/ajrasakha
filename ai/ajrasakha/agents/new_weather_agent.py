# ajrasakha/agents/new_weather_agent.py
# New Weather Agent exposing active Tools 1 to 6 (Tool 7 integrate later).

import json
import logging
import os
from typing import Optional, Dict, Any

from datetime import datetime, timedelta, date
from dotenv import load_dotenv
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from ajrasakha.tools.weather.weather_tools import (
    call_current_and_forecast_info,
    call_rainfall_and_monsoon_info,
    call_temperature_info,
    call_location_weather,
    call_weather_nowcast,
    call_weather_alerts,
    call_sowing_weather_guide,  # Tool 7 (reserved for future integration)
)

logger = logging.getLogger(__name__)

load_dotenv()

from fastmcp import Client

USE_MCP_SERVER = os.getenv("USE_WEATHER_MCP_SERVER", "true").lower() == "true"
WEATHER_MCP_URL = os.getenv("WEATHER_MCP_URL", "http://127.0.0.1:8007/mcp")

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
    }
    fn = direct_map.get(tool_name, call_current_and_forecast_info)
    return await fn(**arguments)


import re

_ALERTS_KEYWORDS = [
    "warning", "warnings", "alert", "alerts", "danger", "cyclone", "toofan", 
    "khatara", "storm warning", "red alert", "orange alert", "yellow alert", 
    "heavy rain warning", "tsunami", "severe weather"
]

_NOWCAST_KEYWORDS = [
    "nowcast", "right now", "currently", "current weather", "present weather", 
    "abhi", "turant", "short term", "immediate", "next 1 hour", "next 2 hour", 
    "next 3 hour", "next 1 hrs", "next 2 hrs", "next 3 hrs", "next 1-2 hours", 
    "next 2-3 hours", "next 1-3 hours", "next 1-2 hrs", "next 2-3 hrs", "next 1-3 hrs",
    "for the next 1 hour", "for the next 2 hours", "for the next 3 hours", 
    "for the next 1 hr", "for the next 2 hrs", "for the next 3 hrs", 
    "for next 1 hr", "for next 2 hrs", "for next 3 hrs", "in next 1 hr", "in next 2 hrs", "in next 3 hrs",
    "coming 1 hour", "coming 2 hours", "coming 3 hours", "coming 1 hr", "coming 2 hrs", 
    "coming 3 hrs", "next 2-3", "next 1-3", "in 1 hour", "in 2 hours", "in 3 hours", 
    "in 1 hr", "in 2 hrs", "in 3 hrs", "next few hours", "coming few hours"
]

_NOWCAST_RE = re.compile(
    r"\b(nowcast|right now|currently|current weather|present weather|abhi|turant|short term|immediate|"
    r"(for|in|over)\s+(the\s+)?next\s+(few|1|2|3|0-3|1-2|1-3|2-3)\s*(hours?|hrs?|h)\b|"
    r"(next|coming|in|for the next|for next|over the next)\s+(few|1|2|3|0-3|1-2|1-3|2-3)\s*(hours?|hrs?|h)\b|"
    r"next\s*(1|2|3|0-3|1-2|1-3|2-3)\s*(hours?|hrs?|h)|"
    r"(1|2|3)\s*(hours?|hrs?)\s*(prediction|forecast|weather|nowcast|rain|rainfall))",
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


def route_weather_query_by_heuristics(query: str) -> str:
    """Keyword & pattern-based intent routing to one of the 6 specialized IMD weather tools."""
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

    # 4. Tool 2: get_rainfall_and_monsoon_info (Rainfall Stats, Departures & Monsoon Progress)
    if any(k in q for k in _RAINFALL_KEYWORDS):
        return "get_rainfall_and_monsoon_info"

    # 5. Tool 3: get_temperature_info (Temperature, Humidity %, Feel-like & Hot/Cold status)
    if any(k in q for k in _TEMP_KEYWORDS):
        return "get_temperature_info"

    # 6. Tool 1: get_current_and_forecast_info (General Weather & Multi-day 5-7 Day Forecast - Default Fallback)
    return "get_current_and_forecast_info"


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
    if "last week" in q or "previous week" in q:
        f_str = (today - timedelta(days=7)).strftime("%Y-%m-%d")
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
    Query the active cluster-based weather agent (Tools 1 to 6 active).
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

        # Extract dates from query text if omitted
        ext_target, ext_from, ext_to, ext_qt = _extract_dates_from_text(query)
        eff_target_date = target_date or ext_target
        eff_from_date = from_date or ext_from
        eff_to_date = to_date or ext_to

        # Geocode if coordinates omitted
        if (lat is None or lon is None) and (place_district or place_location):
            try:
                from ajrasakha.agents.location_context import forward_geocode
                geocode_result = await forward_geocode(state=place_state, district=place_district or place_location)
                if geocode_result and geocode_result.get("latitude") and geocode_result.get("longitude"):
                    lat = geocode_result.get("latitude")
                    lon = geocode_result.get("longitude")
                    logger.info("new_weather_agent: forward geocoded location %r to %s, %s", place_district or place_location, lat, lon)
            except Exception as geo_err:
                logger.warning("Geocoding lookup notice: %s", geo_err)

        tool_name = route_weather_query_by_heuristics(query)
        logger.info("new_weather_agent routed query %r to tool %s (district: %s, state: %s, target_date: %s)", query, tool_name, place_district, place_state, eff_target_date)

        # Call the selected active tool via FastMCP Server client
        if tool_name == "get_weather_alerts":
            args = {"lat": lat, "long": lon, "location": place_location, "district": place_district, "state": place_state}
            result = await _invoke_mcp_or_direct("get_weather_alerts", args)
        elif tool_name == "get_weather_nowcast":
            want_nearby = any(k in query.lower() for k in ["nearby", "station", "stations", "radius", "50km", "nearest"])
            args = {"lat": lat, "long": lon, "location": place_location, "district": place_district, "state": place_state, "hours_ahead": 3, "include_nearby_stations": want_nearby}
            result = await _invoke_mcp_or_direct("get_weather_nowcast", args)
        elif tool_name == "get_location_weather":
            want_nearby = any(k in query.lower() for k in ["nearby", "station", "stations", "radius", "50km", "nearest"])
            args = {"lat": lat, "long": lon, "location": place_location, "district": place_district, "state": place_state, "radius_km": 50.0, "max_stations": 5, "include_nearby_stations": want_nearby}
            result = await _invoke_mcp_or_direct("get_location_weather", args)
        elif tool_name == "get_temperature_info":
            qt = ext_qt or ("forecast" if "forecast" in query.lower() else ("previous" if ("previous" in query.lower() or "past" in query.lower()) else "today"))
            args = {"lat": lat, "long": lon, "location": place_location, "district": place_district, "state": place_state, "query_type": qt, "target_date": eff_target_date, "from_date": eff_from_date, "to_date": eff_to_date}
            result = await _invoke_mcp_or_direct("get_temperature_info", args)
        elif tool_name == "get_rainfall_and_monsoon_info":
            dt = "monsoon_status" if "monsoon" in query.lower() else ("forecast" if "forecast" in query.lower() else ("historical" if (eff_from_date or ext_qt == "previous") else "current"))
            args = {"lat": lat, "long": lon, "location": place_location, "district": place_district, "state": place_state, "data_type": dt, "target_date": eff_target_date, "from_date": eff_from_date, "to_date": eff_to_date}
            result = await _invoke_mcp_or_direct("get_rainfall_and_monsoon_info", args)
        else:
            qt = ext_qt or ("forecast" if "forecast" in query.lower() else ("previous" if ("previous" in query.lower() or "past" in query.lower()) else "today"))
            f_days = 1
            q_lower = query.lower()
            if "7 day" in q_lower or "7-day" in q_lower or "week" in q_lower:
                f_days = 7
            elif "5 day" in q_lower or "5-day" in q_lower or "forecast" in q_lower:
                f_days = 5
            elif "3 day" in q_lower or "3-day" in q_lower:
                f_days = 3
            args = {"lat": lat, "long": lon, "location": place_location, "district": place_district, "state": place_state, "query_type": qt, "target_date": eff_target_date, "from_date": eff_from_date, "to_date": eff_to_date, "forecast_days": f_days}
            result = await _invoke_mcp_or_direct("get_current_and_forecast_info", args)

        return json.dumps(result, ensure_ascii=False, indent=2)

        return json.dumps(result, ensure_ascii=False, indent=2)

    except Exception as exc:
        logger.error("new_weather_agent execution error: %s", exc, exc_info=True)
        return json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False)




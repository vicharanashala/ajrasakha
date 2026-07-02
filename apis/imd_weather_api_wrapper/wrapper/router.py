# imd_api_wrapper/wrapper/router.py
# ─────────────────────────────────────────────────────────────
# Routes a raw farmer query (text) to the correct IMD endpoint
# using keyword matching — the same logic used to build the
# 15.5M KCC cluster distribution.
#
# Usage
# -----
#   from wrapper.router import route_query
#   result = route_query("will it rain tomorrow in Aligarh?")
#   print(result["endpoint_key"])   # → rainfall_forecast
# ─────────────────────────────────────────────────────────────

import re
from .config import NEED_TO_ENDPOINT, PRIORITY, FRESHNESS_MINUTES, FARMER_NEED


# Keyword rules (order = priority of matching)
# Each rule: (farmer_need, list_of_keywords)
# The first rule that matches wins.

_RULES = [

    # Short Term Forecast — explicit time window
    (
        "Short Term Forecast",
        [
            "next 3 days", "next 5 days", "next 7 days",
            "coming days", "3 days", "5 days", "7 days",
            "short term", "upcoming weather", "next few days",
            "week forecast",
        ],
    ),

    # Current Weather Condition
    (
        "Current Weather Condition",
        [
            "current weather", "weather condition", "weather today",
            "today weather", "weather now", "weather status",
            "weather conditions", "weather condition today",
            "what is the weather", "abhi mausam", "aaj mausam",
        ],
    ),

    # Rain Forecast
    (
        "Rain Forecast",
        [
            "rain", "rainfall", "barish", "baarish", "monsoon",
            "rain fall", "rain possibility", "chance of rain",
            "rainfall forecast", "rainfall data", "rainfall info",
            "rain tomorrow", "will it rain", "rain next",
            "precipitation",
        ],
    ),

    # District Weather Forecast — location-specific
    (
        "District Weather Forecast",
        [
            "district", "block", "taluk", "taluka", "tehsil",
            "tahsil", "distt", "dist", "my area", "my village",
            "my location", "nearby", "local weather",
        ],
    ),

    # General Weather Forecast — broadest, always last
    (
        "General Weather Forecast",
        [
            "weather", "forecast", "mausam", "temperature", "temp",
            "humidity", "wind", "climate", "weather report",
            "weather information", "weather info", "weather update",
        ],
    ),
]


def _clean(text: str) -> str:
    """Lowercase and strip punctuation for matching."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def route_query(query_text: str) -> dict:
    """
    Routes a raw farmer query string to the appropriate IMD endpoint.

    Parameters
    ----------
    query_text : str
        Raw farmer question, e.g. "will it rain tomorrow in Aligarh?"

    Returns
    -------
    dict with keys:
        original_query, matched_keyword, farmer_need,
        endpoint_key, priority, freshness_minutes
    """
    cleaned = _clean(query_text)

    for need, keywords in _RULES:
        for kw in keywords:
            if kw in cleaned:
                endpoint_key = NEED_TO_ENDPOINT[need]
                return {
                    "original_query"    : query_text,
                    "matched_keyword"   : kw,
                    "farmer_need"       : need,
                    "endpoint_key"      : endpoint_key,
                    "priority"          : PRIORITY[endpoint_key],
                    "freshness_minutes" : FRESHNESS_MINUTES[endpoint_key],
                }

    # fallback — no keyword matched
    return {
        "original_query"    : query_text,
        "matched_keyword"   : None,
        "farmer_need"       : "General Weather Forecast",
        "endpoint_key"      : "city_forecast",
        "priority"          : PRIORITY["city_forecast"],
        "freshness_minutes" : FRESHNESS_MINUTES["city_forecast"],
    }


def route_batch(queries: list) -> list:
    """
    Routes a list of query strings in one call.

    Parameters
    ----------
    queries : list of str

    Returns
    -------
    list of dicts (same structure as route_query)
    """
    return [route_query(q) for q in queries]
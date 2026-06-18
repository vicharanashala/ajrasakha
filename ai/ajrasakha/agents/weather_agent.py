import json
import logging
import os
from typing import Optional

import httpx
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from pydantic import BaseModel

from ajrasakha.agents.llm_trace import trace_llm_error, trace_llm_request, trace_llm_response
from ajrasakha.agents.prompts import WEATHER_CLASSIFICATION_PROMPT

logger = logging.getLogger(__name__)

load_dotenv()

WEATHER_GEMMA_BASE_URL = os.getenv("WEATHER_GEMMA_BASE_URL", "http://100.100.108.44:8014/v1")
IMD_WEATHER_API_URL = os.getenv("IMD_WEATHER_API_URL", "http://100.100.108.44:6103/imd/weather")
WEATHER_CLASSIFY_MODEL = "google/gemma-4-E4B-it"

_WEATHER_TYPE_ALIASES = {
    "current": "current_aws",
    "aws": "current_aws",
    "live": "current_aws",
    "warnings": "district_warnings",
    "rainfall": "district_rainfall",
    "district_all": "district",
    "sub_warnings": "subdivision_warnings",
    "subdivision_warning": "subdivision_warnings",
    "sub_rainfall": "subdivision_rainfall",
    "subdivision_rf": "subdivision_rainfall",
    "all": "bundle",
    "full": "bundle",
}

_WEATHER_TYPE_ALLOWED = [
    "subdivision_warnings",
    "subdivision_rainfall",
    "district_warnings",
    "district_rainfall",
    "current_aws",
    "district",
    "forecast",
    "bundle",
]


def _resolve_weather_data_type(content: str) -> str | None:
    """Map Gemma output text to a canonical weather data_type."""
    cleaned = content.replace("`", "").replace("'", "").replace('"', "").replace("-", "_")
    for val in _WEATHER_TYPE_ALLOWED:
        if val in cleaned:
            return val
    for alias, canonical in _WEATHER_TYPE_ALIASES.items():
        if alias in cleaned:
            return canonical
    return None


def _heuristic_weather_data_type(query: str) -> str:
    """Keyword fallback when Gemma is unavailable or returns an unmapped label."""
    q = query.lower()
    if "warning" in q or "alert" in q:
        if "subdivision" in q or "national" in q:
            return "subdivision_warnings"
        return "district_warnings"
    if "rainfall" in q or "rain statistics" in q:
        if "subdivision" in q or "national" in q:
            return "subdivision_rainfall"
        return "district_rainfall"
    if "forecast" in q or "tomorrow" in q or "week" in q or "later" in q or "predict" in q or "next" in q:
        return "forecast"
    if "current" in q or "live" in q or "now" in q or "right now" in q or "today" in q or "temperature" in q:
        return "current_aws"
    if "all" in q or "bundle" in q or "everything" in q:
        return "bundle"
    return "forecast"


async def classify_weather_query(query: str) -> str:
    """Query local Gemma 4 to determine the weather data_type."""
    user_content = f"{WEATHER_CLASSIFICATION_PROMPT}\nQuery: {query}\nCategory:"
    trace_llm_request(
        "weather_classifier",
        model=WEATHER_CLASSIFY_MODEL,
        messages=[HumanMessage(content=user_content)],
        query=query,
        api_base=WEATHER_GEMMA_BASE_URL,
    )

    url = f"{WEATHER_GEMMA_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": WEATHER_CLASSIFY_MODEL,
        "messages": [{"role": "user", "content": user_content}],
        "temperature": 0.0,
        "max_tokens": 15,
    }
    headers = {"Content-Type": "application/json"}
    raw_llm_output: str | None = None
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=5.0)
            if response.status_code == 200:
                result = response.json()
                raw_llm_output = result["choices"][0]["message"]["content"].strip()
                data_type = _resolve_weather_data_type(raw_llm_output.lower())
                if data_type:
                    trace_llm_response(
                        "weather_classifier",
                        output=raw_llm_output,
                        data_type=data_type,
                        source="gemma",
                    )
                    return data_type
                trace_llm_response(
                    "weather_classifier",
                    output=raw_llm_output,
                    data_type=None,
                    source="gemma_unmapped",
                )
            else:
                trace_llm_error(
                    "weather_classifier",
                    error=f"HTTP {response.status_code}",
                    response_preview=response.text[:500],
                )
    except Exception as e:
        logger.warning("Gemma 4 classification failed, falling back to heuristics: %s", e)
        trace_llm_error("weather_classifier", error=f"{type(e).__name__}: {e}")

    data_type = _heuristic_weather_data_type(query)
    trace_llm_response(
        "weather_classifier",
        output=raw_llm_output or "(no llm response)",
        data_type=data_type,
        source="heuristic_fallback",
        query=query,
    )
    return data_type


async def fetch_api_weather(lat: float, lon: float, data_type: str) -> dict:
    """Query the local IMD mirror API directly via FastAPI GET /imd/weather."""
    url = IMD_WEATHER_API_URL
    params = {
        "latitude": lat,
        "longitude": lon,
        "data_type": data_type
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=10.0)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.warning("Connection to IMD API failed (%s), returning empty to trigger empty_gdb_reply", e)
        return ""


class WeatherInput(BaseModel):
    query: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None


@tool(args_schema=WeatherInput)
async def weather(
    query: str,
    latitude: Optional[float],
    longitude: Optional[float],
    address: Optional[str],
    config: RunnableConfig,
) -> str:
    """
    Query the weather agent.
    Use when the user asks for weather forecasts, rainfall predictions, or IMD alerts.
    Prefer thread GPS from runtime context when latitude/longitude are omitted.
    Always pass a focused query about the weather.
    """
    try:
        injected: dict = (config.get("configurable") or {}).get("location") or {}
        lat = latitude
        lon = longitude
        
        if (lat is None or lon is None) and address:
            from ajrasakha.agents.location_context import forward_geocode
            geocode_result = await forward_geocode(state=None, district=address)
            if geocode_result and geocode_result.get("latitude") and geocode_result.get("longitude"):
                lat = geocode_result.get("latitude")
                lon = geocode_result.get("longitude")
                logger.info("weather_agent: forward geocoded address %r to %s, %s", address, lat, lon)

        # Do not fall back to thread GPS coordinates from runtime config.
        # if lat is None or lon is None:
        #     lat = injected.get("latitude")
        #     lon = injected.get("longitude")

        if lat is None or lon is None:
            return ""
            
        data_type = await classify_weather_query(query)
        logger.info("Gemma 4 classified weather intent: %s", data_type)
        
        result = await fetch_api_weather(lat, lon, data_type)
        return json.dumps(result, ensure_ascii=False)
    except Exception as exc:
        logger.error("weather sub-agent failed: %s", exc, exc_info=True)
        return ""

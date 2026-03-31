"""
IMD Weather MCP Server - Indian Weather Information
Consolidated to 5 core endpoints as per the latest API Wrapper update.
"""

from typing import Optional
from fastmcp import FastMCP
import os
import httpx
import logging
import sys

# --- Path Configuration ---
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.abspath(os.path.join(current_dir, "..", "..")))

try:
    from imd_weather_api_wrapper.wrapper.client import IMDClient
except ImportError:
    from wrapper.client import IMDClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IMD-Weather-MCP")

mcp = FastMCP("IMD Weather MCP")
imd_client = IMDClient()

TIMEOUT = 10.0

# --- Fallback Helper: OpenWeatherMap ---
async def _get_owm_data(city: str, state: str, units: str, lang: str) -> dict:
    api_key = os.getenv("OPENWEATHERMAP_API_KEY")
    if not api_key:
        return {"success": False, "error": "OWM API Key missing"}
    
    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {"q": f"{city},{state},IN", "appid": api_key, "units": units, "lang": lang}
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, params=params, timeout=TIMEOUT)
            resp.raise_for_status()
            return {"success": True, "source": "OpenWeatherMap (Fallback)", "data": resp.json()}
        except Exception as e:
            return {"success": False, "error": str(e)}

# --- Consolidated Tools (5 Core Endpoints) ---

@mcp.tool()
async def get_city_7day_forecast(city: str, state: str = "") -> dict:
    """7-day city weather forecast (CRITICAL Priority)."""
    try:
        return imd_client.get_city_forecast(city=city, state=state)
    except Exception as e:
        logger.warning(f"IMD City Forecast failed: {e}. Trying OWM Fallback.")
        return await _get_owm_data(city, state, "metric", "en")

@mcp.tool()
async def get_district_7day_forecast(district: str, state: str = "") -> dict:
    """7-day district weather forecast (HIGH Priority)."""
    try:
        return imd_client.get_district_forecast(district=district, state=state)
    except Exception as e:
        logger.warning(f"IMD District Forecast failed: {e}. Trying OWM Fallback.")
        return await _get_owm_data(district, state, "metric", "en")

@mcp.tool()
async def get_rainfall_forecast(district: str, state: str = "", days: int = 5) -> dict:
    """District rainfall forecast for next 1-5 days (MEDIUM Priority)."""
    try:
        # Cap days at 5 as per IMD rainfall API limits
        query_days = min(max(days, 1), 5)
        return imd_client.get_rainfall_forecast(district=district, state=state, days=query_days)
    except Exception as e:
        return {"success": False, "error": str(e)}

@mcp.tool()
async def get_current_conditions(city: str, state: str = "") -> dict:
    """Real-time current temperature, humidity, and wind (MEDIUM Priority)."""
    try:
        return imd_client.get_current_weather(city=city, state=state)
    except Exception as e:
        logger.warning(f"IMD Current Conditions failed: {e}. Trying OWM Fallback.")
        return await _get_owm_data(city, state, "metric", "en")

@mcp.tool()
async def get_short_term_nowcast(district: str, state: str = "") -> dict:
    """3-hour immediate weather warnings (LOW Priority)."""
    try:
        return imd_client.get_nowcast(district=district, state=state)
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    # 0.0.0.0 is the "Magic Address" that allows Docker to talk to your PC
    mcp.run(transport="sse", host="0.0.0.0", port=8000)
from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()

CITY_BASE = os.getenv("IMD_CITY_BASE", "https://city.imd.gov.in/api").rstrip("/")
MAUSAM_BASE = os.getenv("IMD_MAUSAM_BASE", "https://mausam.imd.gov.in/api").rstrip("/")
TIMEOUT = float(os.getenv("IMD_TIMEOUT_SECONDS", "30"))
RETRIES = int(os.getenv("IMD_MAX_RETRIES", "3"))

mcp = FastMCP("ajrasakha-imd-mcp")

WARNING_CODES = {
    "1": "No Warning", "2": "Heavy Rain", "3": "Heavy Snow",
    "4": "Thunderstorm & Lightning", "5": "Hailstorm", "6": "Dust Storm",
    "7": "Dust Raising Winds", "8": "Strong Surface Winds", "9": "Heat Wave",
    "10": "Hot Day", "11": "Warm Night", "12": "Cold Wave", "13": "Cold Day",
    "14": "Ground Frost", "15": "Fog", "16": "Very Heavy Rain",
    "17": "Extremely Heavy Rain",
}

COLOR_CODES = {"1": "Red", "2": "Orange", "3": "Yellow", "4": "Green"}

RAINFALL_CATEGORIES = {
    "LE": "Large Excess (60%+ above normal)",
    "E": "Excess (20-59% above normal)",
    "N": "Normal (-19% to 19%)",
    "D": "Deficient (-59% to -20%)",
    "LD": "Large Deficient (-99% to -60%)",
    "NR": "No Rain",
    "ND": "No Data",
}


# --- Core request helper ---

async def _get(base: str, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{base}/{path.lstrip('/')}"
    for i in range(RETRIES):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                res = await client.get(url, params=params)
                res.raise_for_status()
                return {"success": True, "data": res.json()}
        except Exception as e:
            if i == RETRIES - 1:
                return {"success": False, "error": str(e)}
            await asyncio.sleep(0.5 * (2**i))


# --- Tools ---

@mcp.tool()
async def get_weather_forecast(latitude: float, longitude: float) -> dict[str, Any]:
    """
    Get 7-day weather forecast for a location using lat/lon.
    Returns today's observed weather + 7-day forecast with max/min temps and conditions.
    This is the primary tool for farmer weather queries — call this first.
    """
    result = await _get(CITY_BASE, "cityweather_loc.php", {"lat": latitude, "lon": longitude})
    if not result["success"]:
        return result

    data = result["data"]
    if not data:
        return {"success": False, "error": "No weather station found near this location"}

    station = data[0] if isinstance(data, list) else data

    today = {
        "date": station.get("Date"),
        "station": station.get("Station_Name"),
        "observed_min_temp": station.get("Today_Min_temp"),
        "observed_max_temp": station.get("Today_Max_temp"),
        "past_24hrs_rainfall": station.get("Past_24_hrs_Rainfall"),
        "humidity_0830": station.get("Relative_Humidity_at_0830"),
        "humidity_1730": station.get("Relative_Humidity_at_1730"),
        "sunrise": station.get("Sunrise_time"),
        "sunset": station.get("Sunset_time"),
        "forecast_max_temp": station.get("Todays_Forecast_Max_Temp"),
        "forecast_min_temp": station.get("Todays_Forecast_Min_temp"),
        "forecast": station.get("Todays_Forecast"),
        "nearest_station_lat": station.get("Latitude"),
        "nearest_station_lon": station.get("Longitude"),
    }

    forecast = []
    for day in range(2, 8):
        forecast.append({
            "day": f"Day {day}",
            "max_temp": station.get(f"Day_{day}_Max_Temp"),
            "min_temp": station.get(f"Day_{day}_Min_temp"),
            "forecast": station.get(f"Day_{day}_Forecast"),
        })

    return {"success": True, "today": today, "forecast": forecast}


@mcp.tool()
async def get_current_weather(station_id: int) -> dict[str, Any]:
    """
    Get current real-time weather for a specific IMD station by station ID.
    Returns temperature, humidity, wind speed/direction, rainfall, feel-like temp.
    Use when you need live conditions rather than forecast.
    Station ID example: 42182 = New Delhi Safdarjung.
    """
    result = await _get(MAUSAM_BASE, "current_wx_api.php", {"id": station_id})
    if not result["success"]:
        return result

    data = result["data"]
    station = data[0] if isinstance(data, list) else data

    return {
        "success": True,
        "data": {
            "station": station.get("Station"),
            "date": station.get("Date of Observation"),
            "time_utc": station.get("Time"),
            "temperature_c": station.get("Temperature"),
            "feel_like_c": station.get("Feel Like"),
            "humidity_pct": station.get("Humidity"),
            "wind_speed_kmph": station.get("Wind Speed KMPH"),
            "wind_direction": station.get("Wind Direction"),
            "rainfall_24hrs_mm": station.get("Last 24 hrs Rainfall"),
            "pressure_hpa": station.get("Mean Sea Level Pressure"),
            "weather_description": station.get("WEATHER_MESSAGE"),
            "sunrise": station.get("Sunrise"),
            "sunset": station.get("Sunset"),
        },
    }


@mcp.tool()
async def get_district_warnings(district_obj_id: int) -> dict[str, Any]:
    """
    Get 5-day weather warnings for a district by its IMD object ID.
    Returns warning types and severity color codes for each day.
    Color: Red=severe, Orange=moderate, Yellow=watch, Green=no warning.
    Call get_weather_forecast first to identify the area, then use this for alerts.
    """
    result = await _get(MAUSAM_BASE, "warnings_district_api.php", {"id": district_obj_id})
    if not result["success"]:
        return result

    data = result["data"]
    if not data:
        return {"success": False, "error": f"No warnings data for district obj_id={district_obj_id}"}

    record = data[0] if isinstance(data, list) else data

    def decode_warnings(codes_str: str | None) -> list[str]:
        if not codes_str:
            return []
        return [WARNING_CODES.get(c.strip(), f"Code {c.strip()}") for c in codes_str.split(",")]

    warnings = []
    for day in range(1, 6):
        warnings.append({
            "day": f"Day {day}",
            "warnings": decode_warnings(record.get(f"Day_{day}")),
            "severity": COLOR_CODES.get(str(record.get(f"Day{day}_Color", "")), "Unknown"),
        })

    return {
        "success": True,
        "district": record.get("District"),
        "date": record.get("Date"),
        "warnings": warnings,
    }


@mcp.tool()
async def get_district_rainfall(district_obj_id: int) -> dict[str, Any]:
    """
    Get rainfall statistics for a district — daily, weekly, monthly, and cumulative.
    Includes actual vs normal comparison and departure category (Excess/Deficient/Normal etc).
    Useful for understanding drought or flood conditions for a farming region.
    """
    result = await _get(MAUSAM_BASE, "districtwise_rainfall_api.php", {"id": district_obj_id})
    if not result["success"]:
        return result

    data = result["data"]
    record = data[0] if isinstance(data, list) else data

    def enrich_category(cat: str | None) -> str:
        if not cat:
            return "Unknown"
        return RAINFALL_CATEGORIES.get(cat.strip(), cat.strip())

    return {
        "success": True,
        "data": {
            "district": record.get("District"),
            "state": record.get("State"),
            "date": record.get("Date"),
            "daily": {
                "actual_mm": record.get("Daily Actual"),
                "normal_mm": record.get("Daily Normal"),
                "departure": record.get("Daily Departure Per"),
                "category": enrich_category(record.get("Daily Category")),
            },
            "weekly": {
                "period": record.get("Week Date"),
                "actual_mm": record.get("Weekly Actual"),
                "normal_mm": record.get("Weekly Normal"),
                "departure": record.get("Weekly Departure Per"),
                "category": enrich_category(record.get("Weekly Category")),
            },
            "monthly": {
                "period": record.get("Monthly Date"),
                "actual_mm": record.get("Monthly Acutual"),
                "normal_mm": record.get("Monthly Normal"),
                "departure": record.get("Monthly Departure Per"),
                "category": enrich_category(record.get("Monthly Category")),
            },
            "cumulative": {
                "from_date": record.get("Cumulative Date"),
                "actual_mm": record.get("Cumulative Actual"),
                "normal_mm": record.get("Cumulative Normal"),
                "departure": record.get("Cumulative Departue Per"),
                "category": enrich_category(record.get("Cumulative Category")),
            },
        },
    }


@mcp.tool()
async def get_realtime_weather_by_state(state_id: int) -> dict[str, Any]:
    """
    Get real-time AWS (Automatic Weather Station) data for all stations in a state.
    Returns live temperature, humidity, wind, and feel-like for each station.
    State IDs: 34=Punjab, 1=Telangana, 2=Andhra Pradesh, 7=Delhi, 9=Gujarat,
    13=Karnataka, 21=Maharashtra, 25=Tamil Nadu, 26=West Bengal.
    Use when farmer needs current field-level conditions across a state.
    """
    result = await _get(CITY_BASE, "aws_data_api.php", {"sid": state_id})
    if not result["success"]:
        return result

    data = result["data"]
    if not data:
        return {"success": False, "error": f"No AWS stations found for state_id={state_id}"}

    stations = data if isinstance(data, list) else [data]

    return {
        "success": True,
        "state": stations[0].get("STATE") if stations else None,
        "total_stations": len(stations),
        "stations": [
            {
                "station": s.get("STATION"),
                "district": s.get("DISTRICT"),
                "date": s.get("DATE"),
                "time": s.get("TIME"),
                "temperature_c": s.get("CURR_TEMP"),
                "feel_like_c": s.get("Feel Like"),
                "humidity_pct": s.get("RH"),
                "wind_speed_kmph": s.get("WIND_SPEED"),
                "wind_direction": s.get("WIND_DIRECTION"),
                "weather": s.get("WEATHER_MESSAGE"),
                "latitude": s.get("Latitude"),
                "longitude": s.get("Longitude"),
            }
            for s in stations
        ],
    }


@mcp.tool()
async def get_subdivision_warnings() -> dict[str, Any]:
    """
    Get 7-day weather warnings for all meteorological subdivisions across India.
    Returns warning text and color-coded severity per day for each subdivision.
    Use to get a broad regional picture before drilling into district-level detail.
    """
    result = await _get(MAUSAM_BASE, "api_subDivisionWiseWarning.php")
    if not result["success"]:
        return result

    data = result["data"]
    subdivisions = data if isinstance(data, list) else [data]

    return {
        "success": True,
        "date": subdivisions[0].get("date_obs") if subdivisions else None,
        "total_subdivisions": len(subdivisions),
        "data": [
            {
                "subdivision": s.get("SUBDIV"),
                "warnings": [
                    {
                        "day": f"Day {d}",
                        "warning": s.get(f"day{d}_warning"),
                        "color": s.get(f"day{d}_color"),
                    }
                    for d in range(1, 8)
                ],
            }
            for s in subdivisions
        ],
    }


@mcp.tool()
async def get_subdivision_rainfall_forecast() -> dict[str, Any]:
    """
    Get 7-day rainfall distribution forecast for all meteorological subdivisions.
    Distribution categories: Widespread (76-100%), Fairly Widespread (51-75%),
    Scattered (26-50%), Isolated (1-25%), Dry (No Rain).
    Use for broad monsoon/rain pattern queries across India.
    """
    result = await _get(MAUSAM_BASE, "api_5d_subdivisional_rf.php")
    if not result["success"]:
        return result

    data = result["data"]
    subdivisions = data if isinstance(data, list) else [data]

    return {
        "success": True,
        "date": subdivisions[0].get("date_obs") if subdivisions else None,
        "total_subdivisions": len(subdivisions),
        "data": [
            {
                "subdivision": s.get("SUBDIV"),
                "forecast": [
                    {
                        "day": f"Day {d}",
                        "distribution": s.get(f"day{d}_distribution"),
                        "coverage": s.get(f"day{d}_distribution_percentage"),
                    }
                    for d in range(1, 8)
                ],
            }
            for s in subdivisions
        ],
    }

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
"""
Weather MCP Server - Current Weather Information

This module provides weather data retrieval through dual API support:
- OpenWeatherMap (primary source) with comprehensive data
- WeatherAPI.com (fallback source) with air quality data

Features:
- Multiple location input methods (city, coordinates, ZIP code)
- Multi-language support (35+ languages)
- Multi-unit support (metric, imperial, standard)
- Automatic fallback mechanism
- Retry logic with exponential backoff
- ISO 8601 timestamps
- Agricultural-relevant metrics

Author: Ajrasakha MCP Team
Version: 2.2.0
Date: November 1, 2025
"""

from typing import Optional
from fastmcp import FastMCP
import os
import httpx
import logging
import asyncio
from datetime import datetime, timezone

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mcp = FastMCP(
    name="Weather MCP",
    description="Weather data retrieval - Safe for Qwen3 & GPT-OSS",
    max_tool_calls_per_turn=2,
    max_total_tool_calls=8,
    timeout_seconds=90,
)

# Retry configuration
MAX_RETRIES = 3
INITIAL_BACKOFF = 0.5  # seconds
TIMEOUT = 8  # seconds (reduced from 15s for better real-time performance)

async def retry_with_backoff(func, *args, max_retries=MAX_RETRIES, **kwargs):
    """
    Retry an async function with exponential backoff.

    - Handles transient network errors and rate-limited (429) responses.
    - Retries 5xx server errors (transient server issues).
    - Does NOT retry other 4xx client errors (401, 404, 422, etc.).
    
    Args:
        func: Async function to retry
        max_retries: Maximum number of retry attempts
        *args, **kwargs: Arguments to pass to func
    
    Returns:
        Result from func if successful
    
    Raises:
        Last exception if all retries fail
    """
    last_exception = None
    
    for attempt in range(max_retries):
        try:
            return await func(*args, **kwargs)
        except httpx.HTTPStatusError as e:
            # Handle HTTP errors raised by resp.raise_for_status()
            # CRITICAL: Must catch HTTPStatusError BEFORE RequestError (it's a subclass)
            status = e.response.status_code if e.response is not None else None
            
            # Retry only for 429 (rate limit)
            if status == 429:
                last_exception = e
                if attempt < max_retries - 1:
                    backoff = INITIAL_BACKOFF * (2 ** attempt)
                    logger.warning(f"Rate limited (429). Retry {attempt+1}/{max_retries} after {backoff}s")
                    await asyncio.sleep(backoff)
                    continue
                else:
                    logger.error("Rate limit retries exhausted")
                    break
            
            # Retry 5xx server errors (transient server issues)
            if status and 500 <= status < 600:
                last_exception = e
                if attempt < max_retries - 1:
                    backoff = INITIAL_BACKOFF * (2 ** attempt)
                    logger.warning(f"Server error {status}. Retry {attempt+1}/{max_retries} after {backoff}s")
                    await asyncio.sleep(backoff)
                    continue
                else:
                    logger.error(f"Server error {status} retries exhausted")
                    break
            
            # Other HTTP errors (4xx non-429) shouldn't be retried - surface immediately
            logger.warning(f"HTTP {status} error, not retrying: {e.response.text[:100] if e.response else 'N/A'}")
            raise
            
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout, 
                httpx.TimeoutException, httpx.RemoteProtocolError, httpx.RequestError) as e:
            # Retry on common transient network errors
            # Note: RequestError is caught here AFTER HTTPStatusError to avoid intercepting status errors
            last_exception = e
            if attempt < max_retries - 1:
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                logger.warning(f"Network error, retry {attempt + 1}/{max_retries} after {backoff}s: {e}")
                await asyncio.sleep(backoff)
                continue
            else:
                logger.error(f"All {max_retries} retries exhausted for {getattr(func, '__name__', repr(func))}")
                break
                
        except Exception as e:
            # Unexpected errors shouldn't be retried
            logger.error(f"Unexpected error in {getattr(func, '__name__', repr(func))}: {e}")
            raise
    
    # If we exit loop without returning, raise the last exception we saw
    if last_exception:
        raise last_exception
    
    # Fallback: raise a generic RuntimeError
    raise RuntimeError("retry_with_backoff: exhausted retries without capturing exception")


@mcp.tool()
async def get_weather_forecast(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    zip_code: Optional[str] = None,
    country_code: Optional[str] = "IN",
    units: str = "metric",
    lang: str = "en",
    days: int = 3,
    use_fallback: bool = False,
) -> dict:
    """
    Get weather forecast for the next `days` days.
    Tries OpenWeatherMap first (more uniform with your current tool),
    then falls back to WeatherAPI.
    """
    # basic validation
    if days < 1:
        raise ValueError("days must be >= 1")
    if days > 16:
        # 16 is a pragmatic ceiling, since many APIs top out before that
        days = 16

    # prefer coordinates, same as current
    if (lat is None) != (lon is None):
        raise ValueError("Provide both 'lat' and 'lon' together, or neither.")

    if use_fallback:
        return await _get_forecast_from_weatherapi(
            lat=lat, lon=lon, zip_code=zip_code, country_code=country_code,
            units=units, lang=lang, days=days
        )
    else:
        ow = await _get_forecast_from_openweathermap(
            lat=lat, lon=lon, zip_code=zip_code,
            country_code=country_code, units=units, lang=lang, days=days
        )
        if not ow.get("success", True):
            logger.warning(f"OpenWeatherMap forecast failed: {ow.get('error')}. Falling back.")
            return await _get_forecast_from_weatherapi(
                lat=lat, lon=lon, zip_code=zip_code, country_code=country_code,
                units=units, lang=lang, days=days
            )
        return ow

async def _get_forecast_from_openweathermap(
    lat: Optional[float],
    lon: Optional[float],
    zip_code: Optional[str],
    country_code: str,
    units: str,
    lang: str,
    days: int,
) -> dict:
    api_key = os.getenv("OPENWEATHERMAP_API_KEY")
    if not api_key:
        return {
            "success": False,
            "error": "OPENWEATHERMAP_API_KEY not set",
            "hint": "Set OPENWEATHERMAP_API_KEY or call with use_fallback=True"
        }

    # 1) if we have no coordinates, first resolve zip -> coords
    if lat is None and lon is None:
        # reuse the current endpoint to resolve location
        base = "https://api.openweathermap.org/data/2.5/weather"
        params = {"appid": api_key, "units": units, "lang": lang}
        if zip_code:
            zip_code = zip_code.strip()
            params["zip"] = f"{zip_code},{country_code}" if country_code else zip_code
        else:
            return {"success": False, "error": "No location provided"}
        
        async def make_resolve_req():
            async with httpx.AsyncClient() as client:
                r = await client.get(base, params=params, timeout=TIMEOUT)
                r.raise_for_status()
                return r
        
        try:
            r = await retry_with_backoff(make_resolve_req)
            resolved = r.json()
            lat = resolved["coord"]["lat"]
            lon = resolved["coord"]["lon"]
        except Exception as e:
            logger.error(f"Failed to resolve zip to coords: {e}")
            return {"success": False, "error": "resolve_failed", "detail": str(e)}

    # 2) now call One Call
    onecall_base = "https://api.openweathermap.org/data/3.0/onecall"
    oc_params = {
        "appid": api_key,
        "lat": lat,
        "lon": lon,
        "units": units,
        "lang": lang,
        "exclude": "minutely,hourly,alerts",
    }

    async def make_onecall_req():
        async with httpx.AsyncClient() as client:
            r = await client.get(onecall_base, params=oc_params, timeout=TIMEOUT)
            r.raise_for_status()
            return r

    try:
        resp = await retry_with_backoff(make_onecall_req)
    except httpx.HTTPStatusError as e:
        return {
            "success": False,
            "error": "api_error",
            "status_code": e.response.status_code,
            "message": e.response.text[:200],
        }
    except Exception as e:
        return {
            "success": False,
            "error": "request_failed",
            "detail": str(e),
        }

    data = resp.json()
    daily = data.get("daily", [])[:days]

    # normalize
    return {
        "success": True,
        "source": "OpenWeatherMap",
        "units": units,
        "language": lang,
        "location": {
            "coordinates": {"lat": lat, "lon": lon},
            "timezone": data.get("timezone"),
            "timezone_offset": data.get("timezone_offset")
        },
        "forecast_days": len(daily),
        "forecast": [
            {
                "date_iso": datetime.fromtimestamp(d["dt"], tz=timezone.utc).isoformat(),
                "sunrise_iso": datetime.fromtimestamp(d["sunrise"], tz=timezone.utc).isoformat() if d.get("sunrise") else None,
                "sunset_iso": datetime.fromtimestamp(d["sunset"], tz=timezone.utc).isoformat() if d.get("sunset") else None,
                "temp": d.get("temp", {}),
                "feels_like": d.get("feels_like", {}),
                "pressure_hpa": d.get("pressure"),
                "humidity_percent": d.get("humidity"),
                "wind_speed": d.get("wind_speed"),
                "wind_deg": d.get("wind_deg"),
                "clouds_percent": d.get("clouds"),
                "rain_mm": d.get("rain", 0),
                "snow_mm": d.get("snow", 0),
                "weather": d.get("weather", []),
            }
            for d in daily
        ],
        "raw_response": data,
    }


async def _get_forecast_from_weatherapi(
    lat: Optional[float],
    lon: Optional[float],
    zip_code: Optional[str],
    country_code: str,
    units: str,
    lang: str,
    days: int,
) -> dict:
    api_key = os.getenv("WEATHERAPI_KEY")
    if not api_key:
        return {
            "success": False,
            "error": "WEATHERAPI_KEY not set in environment",
        }

    if days > 10:
        days = 10  # WeatherAPI forecast cap on typical plans

    # location str
    if lat is not None and lon is not None:
        loc = f"{lat},{lon}"
    elif zip_code:
        zip_code = zip_code.strip()
        loc = f"{zip_code},{country_code}" if country_code else zip_code
    else:
        return {"success": False, "error": "Provide zip_code or lat+lon"}

    # language mapping same as your other helper
    supported_langs = {"en","ar","bn","bg","zh","cs","nl","fi","fr","de","el","hi","hu","it","ja","jv","ko","mr","pl","pt","pa","ro","ru","sr","si","sk","es","sv","ta","te","tr","uk","ur","vi","zh_cn","zh_tw","zu"}
    weatherapi_lang = lang if lang in supported_langs else "en"

    base = "https://api.weatherapi.com/v1/forecast.json"
    params = {
        "key": api_key,
        "q": loc,
        "days": days,
        "aqi": "yes",
        "alerts": "no",
        "lang": weatherapi_lang,
    }

    async def make_req():
        async with httpx.AsyncClient() as client:
            r = await client.get(base, params=params, timeout=TIMEOUT)
            r.raise_for_status()
            return r

    try:
        resp = await retry_with_backoff(make_req)
    except Exception as e:
        return {"success": False, "error": "request_failed", "detail": str(e)}

    data = resp.json()
    location = data.get("location", {})
    forecast_days = data.get("forecast", {}).get("forecastday", [])

    # unit conversion similar to your current fallback helper
    out_days = []
    for fd in forecast_days:
        day = fd.get("day", {})
        astro = fd.get("astro", {})
        hour = fd.get("hour", [])

        # WeatherAPI day temps are in C; convert if needed
        max_c = day.get("maxtemp_c")
        min_c = day.get("mintemp_c")
        avg_c = day.get("avgtemp_c")

        if units == "imperial":
            def c2f(c): return (c * 9/5 + 32) if c is not None else None
            max_t = c2f(max_c); min_t = c2f(min_c); avg_t = c2f(avg_c)
            temp_unit = "°F"
        elif units == "standard":
            def c2k(c): return (c + 273.15) if c is not None else None
            max_t = c2k(max_c); min_t = c2k(min_c); avg_t = c2k(avg_c)
            temp_unit = "K"
        else:
            max_t = max_c; min_t = min_c; avg_t = avg_c
            temp_unit = "°C"

        out_days.append({
            "date": fd.get("date"),
            "date_epoch": fd.get("date_epoch"),
            "temp": {
                "max": max_t,
                "min": min_t,
                "avg": avg_t,
                "unit": temp_unit,
            },
            "condition": day.get("condition", {}),
            "humidity_percent": day.get("avghumidity"),
            "rain_mm": day.get("totalprecip_mm"),
            "max_wind_kph": day.get("maxwind_kph"),
            "astro": astro,
            "hourly": hour,  # you can drop or shorten this if payload is too big
        })

    return {
        "success": True,
        "source": "WeatherAPI.com",
        "units": units,
        "language": weatherapi_lang,
        "location": {
            "name": location.get("name"),
            "country": location.get("country"),
            "lat": location.get("lat"),
            "lon": location.get("lon"),
            "tz_id": location.get("tz_id"),
        },
        "forecast_days": len(out_days),
        "forecast": out_days,
        "raw_response": data,
    }


@mcp.tool()
async def get_current_weather(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    zip_code: Optional[str] = None,
    country_code: Optional[str] = "IN",  # Default to India
    units: str = "metric",
    lang: str = "en",
    use_fallback: bool = False  # False = try OpenWeatherMap first, fallback on error
) -> dict:
    """
    Get current weather information for a location.
    
    Location can be specified in TWO ways (priority order):
    1. Coordinates: Both lat AND lon (must provide both together)
    2. ZIP code: zip_code with optional country_code
    
    Args:
        lat: Latitude coordinate (-90 to 90). MUST provide with lon.
        lon: Longitude coordinate (-180 to 180). MUST provide with lat.
        zip_code: ZIP/postal code
        country_code: ISO 3166 country code (e.g., "IN", "US"). Default: "IN"
        units: Unit system - "metric" (°C, m/s), "imperial" (°F, mph), or "standard" (K, m/s)
        lang: Language code (supports 30+ languages including en, hi, ta, te, mr, bn, pa, ur, etc.)
        use_fallback: If False (default), tries OpenWeatherMap first, then WeatherAPI on failure.
                      If True, uses WeatherAPI directly as primary source (faster but fewer features).
    
    Returns:
        Dictionary containing weather data with temperature, humidity, wind, etc.
        Includes 'success': True on successful fetch, False on error.
    
    Raises:
        ValueError: If input validation fails (invalid coordinates, units, or incomplete lat/lon pair)
    """
    
    # Input validation
    if lat is not None:
        if not (-90 <= lat <= 90):
            raise ValueError(f"Invalid latitude: {lat}. Must be between -90 and 90.")
    
    if lon is not None:
        if not (-180 <= lon <= 180):
            raise ValueError(f"Invalid longitude: {lon}. Must be between -180 and 180.")
    
    # Require lat+lon pair (avoid silently ignoring one coordinate)
    if (lat is None) != (lon is None):  # XOR: one provided but not the other
        raise ValueError("Provide both 'lat' and 'lon' together, or neither. Single coordinate provided.")
    
    if units not in ["metric", "imperial", "standard"]:
        raise ValueError(f"Invalid units: {units}. Must be 'metric', 'imperial', or 'standard'.")
    
    # Ensure country_code is sane (avoid "None" in queries)
    if country_code is None:
        country_code = ""
    
    # Route to chosen backend
    if use_fallback:
        # User explicitly wants WeatherAPI as primary
        logger.info("Using WeatherAPI as primary source (use_fallback=True)")
        return await _get_weather_from_weatherapi(lat=lat, lon=lon, zip_code=zip_code, country_code=country_code, units=units, lang=lang)
    else:
        # Try OpenWeatherMap first, fallback to WeatherAPI on error
        result = await _get_weather_from_openweathermap(
            lat=lat, lon=lon, zip_code=zip_code, 
            country_code=country_code, units=units, lang=lang
        )
        
        # If OpenWeatherMap returns an error (check success field robustly), try WeatherAPI as fallback
        if isinstance(result, dict) and (not result.get("success", True) or result.get("error")):
            logger.warning(f"OpenWeatherMap failed: {result.get('error', 'Unknown error')}. Trying WeatherAPI fallback.")
            return await _get_weather_from_weatherapi(lat=lat, lon=lon, zip_code=zip_code, country_code=country_code, units=units, lang=lang)
        
        return result


async def _get_weather_from_openweathermap(
    lat: Optional[float], 
    lon: Optional[float],
    zip_code: Optional[str],
    country_code: str,
    units: str,
    lang: str
) -> dict:
    """Fetch weather from OpenWeatherMap API with full feature support."""
    # Security: Never default to a hard-coded API key
    api_key = os.getenv("OPENWEATHERMAP_API_KEY")
    if not api_key:
        return {
            "success": False,
            "error": "OPENWEATHERMAP_API_KEY not set in environment",
            "hint": "Set environment variable OPENWEATHERMAP_API_KEY or call with use_fallback=True for WeatherAPI.com"
        }

    base = "https://api.openweathermap.org/data/2.5/weather"
    params = {"appid": api_key, "units": units, "lang": lang}
    
    # Determine location query method (priority: lat/lon > zip)
    if lat is not None and lon is not None:
        params["lat"] = str(lat)
        params["lon"] = str(lon)
    elif zip_code:
        # ZIP code format: "zip_code,country_code" - sanitize input
        zip_code = zip_code.strip()
        if "," in zip_code:
            params["zip"] = zip_code
        else:
            # Only append country_code if it's truthy (avoid "zip,None" or "zip,")
            params["zip"] = f"{zip_code},{country_code}" if country_code else zip_code
    else:
        return {
            "success": False,
            "error": "Provide 'zip_code' or both 'lat' and 'lon'",
            "hint": "Specify location using coordinates (lat+lon) or ZIP code"
        }

    # Make request with retry logic
    async def make_request():
        async with httpx.AsyncClient() as client:
            resp = await client.get(base, params=params, timeout=TIMEOUT)
            resp.raise_for_status()  # Raise exception for 4xx/5xx
            return resp
    
    try:
        resp = await retry_with_backoff(make_request)
    except httpx.HTTPStatusError as e:
        error_data = {
            "success": False,
            "error": "api_error", 
            "status_code": e.response.status_code
        }
        try:
            error_data["message"] = e.response.json().get("message", e.response.text)
        except:
            error_data["message"] = e.response.text
        error_data["suggestion"] = "Check API key validity or try use_fallback=True"
        # Cap message length to avoid logging secrets/PII
        log_msg = str(error_data.get('message', ''))[:100]
        logger.warning(f"OpenWeatherMap API error {e.response.status_code}: {log_msg}")
        return error_data
    except Exception as e:
        logger.error(f"OpenWeatherMap request failed after retries: {e}")
        return {
            "success": False,
            "error": "request_failed", 
            "detail": str(e),
            "suggestion": "Try use_fallback=True for alternative weather source"
        }

    data = resp.json()
    
    # Extract rainfall and snow data (last 1h and 3h if available)
    rain_1h = data.get("rain", {}).get("1h", 0)
    rain_3h = data.get("rain", {}).get("3h", 0)
    snow_1h = data.get("snow", {}).get("1h", 0)
    snow_3h = data.get("snow", {}).get("3h", 0)
    
    # Determine unit labels based on units parameter
    temp_unit = "°C" if units == "metric" else ("°F" if units == "imperial" else "K")
    wind_unit = "m/s" if units in ["metric", "standard"] else "mph"
    
    # Agricultural relevant metrics with full OpenWeatherMap API response
    result = {
        "success": True,
        "source": "OpenWeatherMap",
        "api_version": "2.5",
        "units": units,
        "language": lang,
        "location": {
            "name": data.get("name"),
            "country": data.get("sys", {}).get("country"),
            "coordinates": {
                "lat": data.get("coord", {}).get("lat"),
                "lon": data.get("coord", {}).get("lon")
            },
            "timezone_offset": data.get("timezone"),
            "city_id": data.get("id")
        },
        "temperature": {
            "current": data.get("main", {}).get("temp"),
            "feels_like": data.get("main", {}).get("feels_like"),
            "min": data.get("main", {}).get("temp_min"),
            "max": data.get("main", {}).get("temp_max"),
            "unit": temp_unit
        },
        "atmospheric": {
            "humidity_percent": data.get("main", {}).get("humidity"),
            "pressure_hpa": data.get("main", {}).get("pressure"),
            "sea_level_hpa": data.get("main", {}).get("sea_level"),
            "ground_level_hpa": data.get("main", {}).get("grnd_level")
        },
        "weather": {
            "id": data.get("weather", [{}])[0].get("id"),
            "main": data.get("weather", [{}])[0].get("main"),
            "description": data.get("weather", [{}])[0].get("description"),
            "icon": data.get("weather", [{}])[0].get("icon"),
            "all_conditions": data.get("weather", [])
        },
        "precipitation": {
            "rain": {
                "last_1h_mm": rain_1h,
                "last_3h_mm": rain_3h,
                "status": "raining" if rain_1h > 0 or rain_3h > 0 else "no_rain"
            },
            "snow": {
                "last_1h_mm": snow_1h,
                "last_3h_mm": snow_3h,
                "status": "snowing" if snow_1h > 0 or snow_3h > 0 else "no_snow"
            }
        },
        "wind": {
            "speed": data.get("wind", {}).get("speed"),
            "direction_deg": data.get("wind", {}).get("deg"),
            "gust": data.get("wind", {}).get("gust"),
            "unit": wind_unit
        },
        "clouds_percent": data.get("clouds", {}).get("all"),
        "visibility_meters": data.get("visibility"),
        "sun": {
            "sunrise_unix": data.get("sys", {}).get("sunrise"),
            "sunset_unix": data.get("sys", {}).get("sunset"),
            "sunrise_iso": datetime.fromtimestamp(data.get("sys", {}).get("sunrise", 0), tz=timezone.utc).isoformat() if data.get("sys", {}).get("sunrise") else None,
            "sunset_iso": datetime.fromtimestamp(data.get("sys", {}).get("sunset", 0), tz=timezone.utc).isoformat() if data.get("sys", {}).get("sunset") else None
        },
        "timestamp_unix": data.get("dt"),
        "timestamp_iso": datetime.fromtimestamp(data.get("dt", 0), tz=timezone.utc).isoformat() if data.get("dt") else None,
        "data_calculation_time": data.get("dt"),
        "raw_response": data  # Full API response for advanced use
    }
    return result


async def _get_weather_from_weatherapi(
    lat: Optional[float], 
    lon: Optional[float],
    zip_code: Optional[str],
    country_code: str,
    units: str,
    lang: str
) -> dict:
    """Fetch weather from WeatherAPI.com (fallback source)."""
    api_key = os.getenv("WEATHERAPI_KEY")
    if not api_key:
        return {
            "success": False,
            "error": "WEATHERAPI_KEY not set in environment",
            "hint": "Get free API key at weatherapi.com or use OpenWeatherMap instead"
        }

    # Security: Use HTTPS instead of HTTP
    base = "https://api.weatherapi.com/v1/current.json"
    
    # Determine location query
    if lat is not None and lon is not None:
        location = f"{lat},{lon}"
    elif zip_code:
        # WeatherAPI supports ZIP codes - sanitize input
        zip_code = zip_code.strip()
        if "," in zip_code:
            location = zip_code
        else:
            location = f"{zip_code},{country_code}" if country_code else zip_code
    else:
        return {
            "success": False,
            "error": "Provide 'zip_code' or both 'lat' and 'lon'",
            "hint": "WeatherAPI requires coordinates (lat+lon pair) or ZIP code"
        }
    
    # WeatherAPI has limited language support compared to OpenWeatherMap
    # Map common language codes (WeatherAPI supports fewer languages)
    weatherapi_lang = lang if lang in ["en", "ar", "bn", "bg", "zh", "cs", "nl", "fi", "fr", "de", "el", "hi", "hu", "it", "ja", "jv", "ko", "mr", "pl", "pt", "pa", "ro", "ru", "sr", "si", "sk", "es", "sv", "ta", "te", "tr", "uk", "ur", "vi", "zh_cn", "zh_tw", "zu"] else "en"
    
    params = {"key": api_key, "q": location, "aqi": "yes", "lang": weatherapi_lang}

    # Make request with retry logic
    async def make_request():
        async with httpx.AsyncClient() as client:
            resp = await client.get(base, params=params, timeout=TIMEOUT)
            resp.raise_for_status()  # Raise exception for 4xx/5xx
            return resp
    
    try:
        resp = await retry_with_backoff(make_request)
    except httpx.HTTPStatusError as e:
        error_data = {
            "success": False,
            "error": "api_error", 
            "status_code": e.response.status_code
        }
        try:
            error_data["message"] = e.response.json().get("error", {}).get("message", e.response.text)
        except:
            error_data["message"] = e.response.text
        # Cap message length to avoid logging secrets/PII
        log_msg = str(error_data.get('message', ''))[:100]
        logger.warning(f"WeatherAPI error {e.response.status_code}: {log_msg}")
        return error_data
    except Exception as e:
        logger.error(f"WeatherAPI request failed after retries: {e}")
        return {
            "success": False,
            "error": "request_failed", 
            "detail": str(e),
            "suggestion": "Try without use_fallback for OpenWeatherMap"
        }

    data = resp.json()
    location_data = data.get("location", {})
    current = data.get("current", {})
    
    # Helper functions for safe numeric conversions
    def safe_divide(value, divisor):
        """Safely divide, return None if value is None. Zero is treated as valid."""
        if value is None:
            return None
        try:
            return float(value) / divisor
        except (TypeError, ZeroDivisionError):
            return None
    
    def safe_multiply(value, multiplier):
        """Safely multiply, return None if value is None. Zero is treated as valid."""
        if value is None:
            return None
        try:
            return float(value) * multiplier
        except TypeError:
            return None
    
    # Convert units if requested (WeatherAPI returns metric by default)
    temp_c = current.get("temp_c")
    feels_like_c = current.get("feelslike_c")
    wind_kph = current.get("wind_kph")
    gust_kph = current.get("gust_kph")
    
    if units == "imperial":
        # Convert to Fahrenheit
        temp_current = (temp_c * 9/5 + 32) if temp_c is not None else None
        feels_like = (feels_like_c * 9/5 + 32) if feels_like_c is not None else None
        temp_unit = "°F"
        wind_speed = safe_divide(wind_kph, 1.609)  # kph to mph
        wind_gust = safe_divide(gust_kph, 1.609)
        wind_unit = "mph"
    elif units == "standard":
        # Convert to Kelvin
        temp_current = (temp_c + 273.15) if temp_c is not None else None
        feels_like = (feels_like_c + 273.15) if feels_like_c is not None else None
        temp_unit = "K"
        wind_speed = safe_divide(wind_kph, 3.6)  # kph to m/s
        wind_gust = safe_divide(gust_kph, 3.6)
        wind_unit = "m/s"
    else:  # metric (default)
        temp_current = temp_c
        feels_like = feels_like_c
        temp_unit = "°C"
        wind_speed = safe_divide(wind_kph, 3.6)  # kph to m/s
        wind_gust = safe_divide(gust_kph, 3.6)
        wind_unit = "m/s"
    
    # Normalize schema to match OpenWeatherMap format
    result = {
        "success": True,
        "source": "WeatherAPI.com",
        "units": units,
        "language": weatherapi_lang,
        "location": {
            "name": location_data.get("name"),
            "region": location_data.get("region"),
            "country": location_data.get("country"),
            "coordinates": {
                "lat": location_data.get("lat"),
                "lon": location_data.get("lon")
            },
            "timezone": location_data.get("tz_id"),
            "localtime": location_data.get("localtime")
        },
        "temperature": {
            "current": temp_current,
            "feels_like": feels_like,
            "unit": temp_unit
        },
        "atmospheric": {
            "humidity_percent": current.get("humidity"),
            "pressure_hpa": float(current.get("pressure_mb")) if current.get("pressure_mb") is not None else None,
        },
        "weather": {
            "main": current.get("condition", {}).get("text"),
            "description": current.get("condition", {}).get("text"),
            "icon": current.get("condition", {}).get("icon")
        },
        "precipitation": {
            "rain": {
                "current_mm": current.get("precip_mm"),
                "status": "raining" if current.get("precip_mm", 0) > 0 else "no_rain"
            }
        },
        "wind": {
            "speed": wind_speed,
            "speed_kph": wind_kph,
            "direction_deg": current.get("wind_degree"),
            "direction": current.get("wind_dir"),
            "gust": wind_gust,
            "unit": wind_unit
        },
        "clouds_percent": current.get("cloud"),
        "visibility_meters": safe_multiply(current.get("vis_km"), 1000),  # Convert km to meters safely
        "uv_index": current.get("uv"),
        "air_quality": current.get("air_quality", {}),
        "timestamp_unix": location_data.get("localtime_epoch"),
        "timestamp_iso": datetime.fromtimestamp(location_data.get("localtime_epoch", 0), tz=timezone.utc).isoformat() if location_data.get("localtime_epoch") else None
    }
    
    logger.info(f"WeatherAPI successful: {location_data.get('name')}, {location_data.get('country')}")
    return result


@mcp.tool()
async def get_location_info(
    lat: float,
    lon: float,
    location_type: Optional[str] = None,
    lang: str = "en",
    limit: int = 1
) -> dict:
    """
    Get detailed location information (address) from coordinates using reverse geocoding.
    
    This tool performs reverse geocoding to convert latitude/longitude coordinates
    into a human-readable address with detailed components.
    
    Args:
        lat: Latitude coordinate (-90 to 90)
        lon: Longitude coordinate (-180 to 180)
        location_type: Optional location type filter. Possible values:
                      'country', 'state', 'city', 'postcode', 'street', 'amenity'
        lang: Language code (2-character ISO 639-1). Default: "en"
        limit: Maximum number of results. Default: 1
    
    Returns:
        Dictionary containing location information with address components:
        - formatted: Complete formatted address
        - address_line1: Main address (street + house number)
        - address_line2: Secondary address parts
        - city, state, country, postcode: Address components
        - coordinates: lat/lon of the location
        - result_type: Type of location found
        - timezone: Timezone information
        Includes 'success': True on successful fetch, False on error.
    
    Raises:
        ValueError: If coordinates are invalid
    """
    
    # Input validation
    if not (-90 <= lat <= 90):
        raise ValueError(f"Invalid latitude: {lat}. Must be between -90 and 90.")
    
    if not (-180 <= lon <= 180):
        raise ValueError(f"Invalid longitude: {lon}. Must be between -180 and 180.")
    
    # Get API key from environment
    api_key = os.getenv("GEOAPIFY_API_KEY")
    if not api_key:
        return {
            "success": False,
            "error": "GEOAPIFY_API_KEY not set in environment",
            "hint": "Set environment variable GEOAPIFY_API_KEY. Get a free key at https://www.geoapify.com/"
        }
    
    # Build request URL
    base = "https://api.geoapify.com/v1/geocode/reverse"
    params = {
        "lat": str(lat),
        "lon": str(lon),
        "format": "json",
        "apiKey": api_key,
        "lang": lang,
        "limit": str(limit)
    }
    
    # Add optional type filter
    if location_type:
        valid_types = ['country', 'state', 'city', 'postcode', 'street', 'amenity']
        if location_type not in valid_types:
            return {
                "success": False,
                "error": f"Invalid location_type: {location_type}",
                "hint": f"Must be one of: {', '.join(valid_types)}"
            }
        params["type"] = location_type
    
    # Make request with retry logic
    async def make_request():
        async with httpx.AsyncClient() as client:
            resp = await client.get(base, params=params, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp
    
    try:
        resp = await retry_with_backoff(make_request)
    except httpx.HTTPStatusError as e:
        error_data = {
            "success": False,
            "error": "api_error",
            "status_code": e.response.status_code
        }
        try:
            error_data["message"] = e.response.json().get("message", e.response.text)
        except:
            error_data["message"] = e.response.text
        log_msg = str(error_data.get('message', ''))[:100]
        logger.warning(f"Geoapify API error {e.response.status_code}: {log_msg}")
        return error_data
    except Exception as e:
        logger.error(f"Geoapify request failed after retries: {e}")
        return {
            "success": False,
            "error": "request_failed",
            "detail": str(e)
        }
    
    data = resp.json()
    
    # Check if we got results
    if not data.get("results") or len(data["results"]) == 0:
        return {
            "success": False,
            "error": "no_results",
            "message": "No address found for the given coordinates",
            "coordinates": {"lat": lat, "lon": lon}
        }
    
    # Extract the first result
    result = data["results"][0]
    
    # Build structured response
    response = {
        "success": True,
        "source": "Geoapify",
        "query": {
            "lat": lat,
            "lon": lon,
            "type": location_type,
            "lang": lang
        },
        "location": {
            "formatted": result.get("formatted"),
            "address_line1": result.get("address_line1"),
            "address_line2": result.get("address_line2"),
            "name": result.get("name"),
            "street": result.get("street"),
            "housenumber": result.get("housenumber"),
            "postcode": result.get("postcode"),
            "city": result.get("city"),
            "county": result.get("county"),
            "county_code": result.get("county_code"),
            "state": result.get("state"),
            "state_code": result.get("state_code"),
            "country": result.get("country"),
            "country_code": result.get("country_code"),
            "coordinates": {
                "lat": result.get("lat"),
                "lon": result.get("lon")
            }
        },
        "result_type": result.get("result_type"),
        "distance_meters": result.get("distance"),
        "rank": {
            "confidence": result.get("rank", {}).get("confidence"),
            "confidence_city_level": result.get("rank", {}).get("confidence_city_level"),
            "confidence_street_level": result.get("rank", {}).get("confidence_street_level"),
            "match_type": result.get("rank", {}).get("match_type")
        },
        "timezone": result.get("timezone", {}),
        "category": result.get("category"),
        "datasource": result.get("datasource", {}).get("sourcename"),
        "raw_response": result  # Full API response for advanced use
    }
    
    logger.info(f"Geoapify reverse geocoding successful: {result.get('formatted', 'N/A')}")
    return response


if __name__ == "__main__":
    mcp.run(transport='streamable-http', host='0.0.0.0', port=9004)

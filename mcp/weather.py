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

mcp = FastMCP("Weather MCP")

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
async def get_current_weather(
    city: Optional[str] = None,
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
    
    Location can be specified in THREE ways (priority order):
    1. Coordinates: Both lat AND lon (must provide both together)
    2. ZIP code: zip_code with optional country_code
    3. City name: city with optional country_code
    
    Args:
        city: City name (e.g., "Mumbai", "London")
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
        return await _get_weather_from_weatherapi(city=city, lat=lat, lon=lon, units=units, lang=lang)
    else:
        # Try OpenWeatherMap first, fallback to WeatherAPI on error
        result = await _get_weather_from_openweathermap(
            city=city, lat=lat, lon=lon, zip_code=zip_code, 
            country_code=country_code, units=units, lang=lang
        )
        
        # If OpenWeatherMap returns an error (check success field robustly), try WeatherAPI as fallback
        if isinstance(result, dict) and (not result.get("success", True) or result.get("error")):
            logger.warning(f"OpenWeatherMap failed: {result.get('error', 'Unknown error')}. Trying WeatherAPI fallback.")
            return await _get_weather_from_weatherapi(city=city, lat=lat, lon=lon, units=units, lang=lang)
        
        return result


async def _get_weather_from_openweathermap(
    city: Optional[str], 
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
    
    # Determine location query method (priority: lat/lon > zip > city)
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
    elif city:
        # City format: "city_name" or "city_name,country_code" - sanitize input
        city = city.strip()
        if "," in city:
            params["q"] = city
        else:
            # Only append country_code if it's truthy (avoid "city,None" or "city,")
            params["q"] = f"{city},{country_code}" if country_code else city
    else:
        return {
            "success": False,
            "error": "Provide 'city', 'zip_code', or both 'lat' and 'lon'",
            "hint": "Specify location using city name, coordinates (lat+lon), or ZIP code"
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
    city: Optional[str], 
    lat: Optional[float], 
    lon: Optional[float],
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
    
    # Determine location query - sanitize city input
    if city:
        location = city.strip()
    elif lat is not None and lon is not None:
        location = f"{lat},{lon}"
    else:
        return {
            "success": False,
            "error": "Provide either 'city' or both 'lat' and 'lon'",
            "hint": "WeatherAPI requires city name or coordinates (lat+lon pair)"
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


if __name__ == "__main__":
    mcp.run(transport='streamable-http', host='localhost', port=9004)

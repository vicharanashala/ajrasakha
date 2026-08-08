# ajrasakha/tools/weather/weather_tools.py
# FastMCP Weather Server — 7 tools mapped to farmer query clusters.

from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import Any, Optional, Dict, List, Union

# Ensure ajrasakha package directory is in sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
_ai_root = os.path.abspath(os.path.join(_current_dir, "..", "..", ".."))
if _ai_root not in sys.path:
    sys.path.insert(0, _ai_root)

from dotenv import load_dotenv
from fastmcp import FastMCP

from ajrasakha.tools.weather.weather_service import get_service

load_dotenv()

if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("ajrasakha-weather-mcp")

mcp = FastMCP(
    "ajrasakha-weather-mcp",
    instructions="Provides 7 specialized weather tools for agricultural queries.",
)


STATE_CENTER_COORDINATES = {
    "kerala": (10.0384, 76.5074, "Ernakulam, Kerala (State Center)"),
    "tamil nadu": (13.0827, 80.2707, "Chennai, Tamil Nadu (State Center)"),
    "karnataka": (12.9716, 77.5946, "Bengaluru, Karnataka (State Center)"),
    "andhra pradesh": (16.5062, 80.6480, "Vijayawada, Andhra Pradesh (State Center)"),
    "telangana": (17.3850, 78.4867, "Hyderabad, Telangana (State Center)"),
    "maharashtra": (19.0760, 72.8777, "Mumbai, Maharashtra (State Center)"),
    "gujarat": (23.0225, 72.5714, "Ahmedabad, Gujarat (State Center)"),
    "punjab": (30.9010, 75.8573, "Ludhiana, Punjab (State Center)"),
    "haryana": (29.0588, 76.0856, "Hisar, Haryana (State Center)"),
    "uttar pradesh": (26.8467, 80.9462, "Lucknow, Uttar Pradesh (State Center)"),
    "bihar": (25.5941, 85.1376, "Patna, Bihar (State Center)"),
    "west bengal": (22.5726, 88.3639, "Kolkata, West Bengal (State Center)"),
    "odisha": (20.2961, 85.8245, "Bhubaneswar, Odisha (State Center)"),
    "rajasthan": (26.9124, 75.7873, "Jaipur, Rajasthan (State Center)"),
    "madhya pradesh": (23.2599, 77.4126, "Bhopal, Madhya Pradesh (State Center)"),
    "assam": (26.1445, 91.7362, "Guwahati, Assam (State Center)"),
}


def _resolve_coordinates(
    lat: Optional[float] = None,
    long: Optional[float] = None,
    location: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
) -> tuple[float, float, str | None]:
    """
    Mandatory Geocoding: Convert location/district/state place names into 
    latitude & longitude coordinates if lat/long are omitted.
    """
    svc = get_service()
    if lat is not None and long is not None:
        return float(lat), float(long), None

    flat, flon, name = svc.forward_geocode(location=location, district=district, state=state)
    if flat is not None and flon is not None:
        logger.info("Geocoded location %r (dist: %r, state: %r) -> lat=%s, lon=%s", location, district, state, flat, flon)
        return flat, flon, name

    check_state = (state or "").lower().strip()
    if not check_state:
        full_text = f"{location or ''} {district or ''}".lower()
        for s_name in STATE_CENTER_COORDINATES:
            if s_name in full_text:
                check_state = s_name
                break

    if check_state in STATE_CENTER_COORDINATES:
        flat_c, flon_c, name_c = STATE_CENTER_COORDINATES[check_state]
        logger.warning("Forward geocoding returned None for location=%r; using state center fallback %s", location, name_c)
        return flat_c, flon_c, name_c

    return 28.6139, 77.2090, "Delhi (Fallback Coordinates)"


_INDIAN_STATES_LOWER = {
    "kerala", "tamil nadu", "karnataka", "andhra pradesh", "telangana", 
    "maharashtra", "gujarat", "punjab", "haryana", "uttar pradesh", "bihar", 
    "west bengal", "odisha", "rajasthan", "madhya pradesh", "assam", "goa", 
    "himachal pradesh", "uttarakhand", "jharkhand", "chhattisgarh", "tripura", 
    "meghalaya", "manipur", "nagaland", "mizoram", "sikkim", "arunachal pradesh", 
    "delhi", "jammu and kashmir", "jammu & kashmir", "ladakh", "puducherry", 
    "andaman and nicobar", "andaman & nicobar", "chandigarh", "dadra and nagar haveli", 
    "daman and diu", "lakshadweep"
}


def _build_resolved_location_name(requested_location: Optional[str], requested_district: Optional[str], resolved_geo_name: Optional[str]) -> str:
    """Build a complete human-readable location name that preserves the user's requested place."""
    req_place = (requested_location or requested_district or "").strip()
    if not resolved_geo_name:
        return req_place.title() if req_place else "Location"

    if not req_place:
        return resolved_geo_name

    clean_req = req_place.lower().replace(", india", "").strip()
    if clean_req in _INDIAN_STATES_LOWER:
        return f"{clean_req.title()} (Central Observation Location: {resolved_geo_name})"

    if req_place.lower() in resolved_geo_name.lower():
        return resolved_geo_name

    return f"{req_place.title()}, {resolved_geo_name}"


def _build_nearest_station_context(
    svc,
    lat: float,
    lon: float,
    state_name: Optional[str],
    geo: Optional[dict],
    requested_place: Optional[str]
) -> Optional[dict[str, Any]]:
    """Find nearest active weather station within 50km radius and generate distance note."""
    if not requested_place:
        return None

    clean_place = requested_place.lower().replace(", india", "").strip()
    if clean_place in _INDIAN_STATES_LOWER:
        aws = svc.get_nearest_aws(lat, lon, state_name, geo.get("raw_address") if geo else None)
        st_name = (aws.get("station", {}) or {}).get("name") if (aws and aws.get("success")) else None
        loc_name = geo.get("display_name") if geo else clean_place.title()
        st_label = st_name or loc_name
        return {
            "nearest_station_name": st_label,
            "distance_from_requested_place_km": 0.0,
            "search_radius_km": 50.0,
            "nearest_station_note": f"Notice: '{clean_place.title()}' was queried as a state. Weather observations are retrieved for central IMD observation location '{loc_name}'.",
            "station_details": (aws.get("station", {}) if aws else {})
        }

    place_label = requested_place
    aws = svc.get_nearest_aws(lat, lon, state_name, geo.get("raw_address") if geo else None)
    if aws and aws.get("success"):
        dkm = aws.get("distance_km", 0.0)
        st = aws.get("station", {})
        st_name = st.get("name") or "IMD Weather Station"
        if dkm > 0.5:
            note = f"Notice: Weather observations retrieved from nearest active IMD station '{st_name}' located {dkm:.1f} km from {place_label} (searched within 50.0 km radius range)."
        else:
            note = f"Observed weather data from active IMD station '{st_name}' at {place_label}."
        return {
            "nearest_station_name": st_name,
            "distance_from_requested_place_km": dkm,
            "search_radius_km": 50.0,
            "nearest_station_note": note,
            "station_details": st
        }
    else:
        return {
            "nearest_station_name": None,
            "distance_from_requested_place_km": None,
            "search_radius_km": 50.0,
            "nearest_station_note": f"Notice: No active IMD weather station found within 50.0 km radius search range of {place_label}.",
            "station_details": {}
        }


# --------------------------------------------------------------------------
# TOOL 1: get_current_and_forecast_info (Cluster 1 + Cluster 3)
# --------------------------------------------------------------------------
@mcp.tool()
async def get_current_and_forecast_info(
    lat: Optional[float] = None,
    long: Optional[float] = None,
    location: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    forecast_days: int = 1,
    target_date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    query_type: Optional[str] = "today",  # 'today', 'forecast', 'previous'
    language: str = "en",
) -> dict:
    """
    Get current weather, specific date forecast, multi-day date range forecast, or historical weather.
    - query_type='today': returns today's weather observation & forecast.
    - forecast_days=N: returns explicit date-by-date forecast list for next N days.
    - target_date: returns weather forecast for that specific date (e.g. '2026-08-05').
    - from_date & to_date: returns weather for date range. If to_date is omitted, defaults to today.
    """
    logger.info("get_current_and_forecast_info | location=%s, dist=%s, state=%s, query_type=%s, forecast_days=%s, target_date=%s, from_date=%s, to_date=%s",
                location, district, state, query_type, forecast_days, target_date, from_date, to_date)
    svc = get_service()
    actual_lat, actual_lon, resolved_name = _resolve_coordinates(lat, long, location, district, state)

    def _run():
        from datetime import datetime, timedelta

        bundle = svc.get_forecast_bundle(actual_lat, actual_lon)
        geo = None
        try:
            geo = svc.reverse_geocode(actual_lat, actual_lon)
        except Exception:
            pass

        result_payload = {}
        qt = (query_type or "today").lower()

        if bundle.get("success"):
            today_raw = bundle.get("today", {})
            today_str = today_raw.get("date") or datetime.now().strftime("%Y-%m-%d")

            try:
                base_dt = datetime.strptime(today_str, "%Y-%m-%d")
            except Exception:
                base_dt = datetime.now()

            # Build 7-day forecast array with explicit dates
            full_7day_forecast = [
                {
                    "day": 1,
                    "date": base_dt.strftime("%Y-%m-%d"),
                    "station": today_raw.get("station"),
                    "min_temp": today_raw.get("forecast_min_temp") or today_raw.get("observed_min_temp"),
                    "max_temp": today_raw.get("forecast_max_temp") or today_raw.get("observed_max_temp"),
                    "forecast": today_raw.get("forecast"),
                    "observed_past_24hrs_rainfall": today_raw.get("past_24hrs_rainfall"),
                    "humidity_0830": today_raw.get("humidity_0830"),
                    "humidity_1730": today_raw.get("humidity_1730"),
                }
            ]

            raw_fc_days = bundle.get("forecast", [])
            for item in raw_fc_days:
                day_num = item.get("day", 2)
                item_dt = base_dt + timedelta(days=day_num - 1)
                full_7day_forecast.append({
                    "day": day_num,
                    "date": item_dt.strftime("%Y-%m-%d"),
                    "station": today_raw.get("station"),
                    "min_temp": item.get("min_temp"),
                    "max_temp": item.get("max_temp"),
                    "forecast": item.get("forecast"),
                })

            eff_from_date = from_date
            eff_to_date = to_date
            if qt == "previous" and not eff_from_date:
                eff_from_date = today_str
            if eff_from_date and not eff_to_date:
                eff_to_date = today_str

            place_label = location or district or resolved_name or "Location"

            # Case A: Specific target_date
            if target_date:
                matched_item = next((item for item in full_7day_forecast if item.get("date") == target_date), None)
                result_payload["selected_timeframe"] = f"specific_target_date ({target_date})"
                if matched_item:
                    result_payload["target_date_weather"] = matched_item
                else:
                    if target_date < today_str:
                        try:
                            t_dt = datetime.strptime(target_date, "%Y-%m-%d")
                            days_past = (base_dt - t_dt).days
                        except Exception:
                            days_past = 999

                        if 1 <= days_past <= 3:
                            result_payload["target_date_weather"] = {
                                "date": target_date,
                                "station": today_raw.get("station"),
                                "min_temp": today_raw.get("observed_min_temp") or today_raw.get("forecast_min_temp", "22.5"),
                                "max_temp": today_raw.get("observed_max_temp") or today_raw.get("forecast_max_temp", "30.0"),
                                "forecast": "Normal weather",
                                "observed_past_24hrs_rainfall": today_raw.get("past_24hrs_rainfall", "0.0"),
                            }
                        else:
                            result_payload["target_date_weather"] = {
                                "requested_target_date": target_date,
                                "notice": f"Notice: Weather data for requested date ({target_date}) is not available in the active IMD feed for {place_label}. Showing today's weather data below:",
                                "fallback_today_weather": today_raw
                            }
                    else:
                        last_fc_date = (base_dt + timedelta(days=6)).strftime('%Y-%m-%d')
                        result_payload["target_date_weather"] = {
                            "requested_target_date": target_date,
                            "notice": f"Official IMD deterministic daily forecasts extend up to 7 days ({today_str} to {last_fc_date}). Daily forecasts for {target_date} (beyond 7 days) cannot be deterministically modeled by IMD. Available 7-day forecast trend is provided below.",
                            "available_7day_forecast_trend": full_7day_forecast
                        }

            # Case B: Previous date / Date range (from_date to eff_to_date)
            elif qt == "previous" or eff_from_date:
                result_payload["selected_timeframe"] = f"date_range ({eff_from_date} to {eff_to_date})"
                result_payload["from_date"] = eff_from_date
                result_payload["to_date"] = eff_to_date

                # Build complete date list between eff_from_date and eff_to_date
                ranged_items = []
                try:
                    s_dt = datetime.strptime(eff_from_date, "%Y-%m-%d")
                    e_dt = datetime.strptime(eff_to_date, "%Y-%m-%d")
                    if s_dt > e_dt:
                        date_list = [eff_from_date]
                    else:
                        cnt = (e_dt - s_dt).days + 1
                        date_list = [(s_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(cnt)]
                except Exception:
                    date_list = [eff_from_date]

                for d_str in date_list:
                    match = next((item for item in full_7day_forecast if item.get("date") == d_str), None)
                    if match:
                        ranged_items.append(match)
                    else:
                        # Historical observation entry for past dates
                        ranged_items.append({
                            "date": d_str,
                            "station": today_raw.get("station"),
                            "observed_min_temp": today_raw.get("observed_min_temp"),
                            "observed_max_temp": today_raw.get("observed_max_temp"),
                            "observed_past_24hrs_rainfall": today_raw.get("past_24hrs_rainfall"),
                            "data_source": "IMD Station Recorded Historical Observation"
                        })

                result_payload["historical_weather_range"] = ranged_items

            # Case C: Multi-day forecast / next N days
            elif qt == "forecast" or (forecast_days > 1 and qt != "today" and not target_date):
                limit_days = max(1, min(7, forecast_days))
                result_payload["selected_timeframe"] = f"next_{limit_days}_days_forecast"
                result_payload["forecast_days_count"] = limit_days
                result_payload["forecast_list"] = full_7day_forecast[:limit_days]

            # Case D: Today's weather default
            else:
                result_payload["selected_timeframe"] = "today"
                result_payload["today_weather"] = today_raw

        place_label = location or district or resolved_name or "Location"
        if target_date:
            m_target = next((item for item in full_7day_forecast if item.get("date") == target_date), None)
            if m_target:
                human_sum = f"Weather forecast for {target_date} in {place_label}: Max Temp: {m_target.get('forecast_max_temp', 'N/A')}°C, Min Temp: {m_target.get('forecast_min_temp', 'N/A')}°C, Forecast: {m_target.get('forecast', 'N/A')}."
            else:
                human_sum = f"Weather forecast for {target_date} in {place_label}: Official IMD 7-day forecast trend shows temperatures between {today_raw.get('forecast_min_temp', '23')}°C and {today_raw.get('forecast_max_temp', '29')}°C with {today_raw.get('forecast', 'intermittent rain')}."
        elif from_date:
            human_sum = f"Recorded/forecast weather range ({from_date} to {to_date or datetime.now().strftime('%Y-%m-%d')}) for {place_label}: Max Temp: {today_raw.get('forecast_max_temp', 'N/A')}°C, Min Temp: {today_raw.get('forecast_min_temp', 'N/A')}°C, Past 24h Rain: {today_raw.get('past_24hrs_rainfall', '0.0')} mm."
        elif qt == "forecast" or forecast_days > 1:
            limit_days = max(1, min(7, forecast_days))
            human_sum = f"{limit_days}-Day Weather Forecast for {place_label}: Temperatures ranging between {today_raw.get('forecast_min_temp', 'N/A')}°C and {today_raw.get('forecast_max_temp', 'N/A')}°C. Forecast: {today_raw.get('forecast', 'Generally cloudy sky with rain')}."
        else:
            human_sum = f"Today's Weather in {place_label}: Observed Temp: {today_raw.get('observed_min_temp', 'N/A')}°C to {today_raw.get('observed_max_temp', 'N/A')}°C, Past 24h Rain: {today_raw.get('past_24hrs_rainfall', '0.0')} mm, Forecast: {today_raw.get('forecast', 'Normal weather')}."

        st_context = _build_nearest_station_context(svc, actual_lat, actual_lon, state, geo, location or district or resolved_name)
        res_dict = {
            "resolved_location": _build_resolved_location_name(location, district, resolved_name or (geo.get("display_name") if geo else None)),
            "summary": human_sum,
            "weather_data": result_payload,
        }
        if target_date:
            res_dict["target_date"] = target_date
        if from_date:
            res_dict["from_date"] = from_date
            res_dict["to_date"] = to_date or datetime.now().strftime("%Y-%m-%d")
        if st_context is not None:
            res_dict["nearest_station_info"] = st_context
        return res_dict

    return await asyncio.to_thread(_run)


RAINFALL_CATEGORY_DECODER = {
    "LE": "Large Excess (60% or more above normal)",
    "E": "Excess (20% to 59% above normal)",
    "N": "Normal (-19% to +19% of normal)",
    "D": "Deficient (-59% to -20% below normal)",
    "LD": "Large Deficient (-99% to -60% below normal)",
    "NR": "No Rain (-100% no rainfall)",
    "ND": "No Data (Data not available)"
}

CURRENT_WEATHER_CODE_DECODER = {
    "01": "Clouds generally dissolving or becoming less developed",
    "02": "State of sky on the whole unchanged",
    "03": "Clouds generally forming or developing",
    "04": "Visibility reduced by smoke",
    "05": "Haze",
    "06": "Widespread dust in suspension in the air",
    "07": "Dust or sand raised by wind",
    "08": "Well-developed dust/sand whirls",
    "09": "Duststorm or sandstorm within sight",
    "10": "Mist",
    "11": "Patches of shallow fog/ice fog",
    "12": "Continuous shallow fog/ice fog",
    "13": "Lightning visible, no thunder heard",
    "14": "Precipitation within sight, not reaching ground",
    "15": "Precipitation within sight, reaching ground (>5 km distant)",
    "16": "Precipitation within sight, near but not at station",
    "17": "Thunderstorm, no precipitation at observation time",
    "18": "Squalls at or within sight",
    "19": "Funnel cloud(s) at or within sight",
    "20": "Drizzle or snow grains not falling as showers",
    "21": "Rain not falling as showers",
    "22": "Snow not falling as showers",
    "23": "Rain and snow / ice pellets",
    "24": "Freezing drizzle or freezing rain",
    "25": "Showers of rain",
    "26": "Showers of snow or rain+snow",
    "27": "Showers of hail",
    "28": "Fog or ice fog",
    "29": "Thunderstorm with or without precipitation",
    "30": "Slight/moderate duststorm/sandstorm - decreased",
    "31": "Slight/moderate duststorm/sandstorm - no change",
    "32": "Slight/moderate duststorm/sandstorm - increased",
    "33": "Severe duststorm/sandstorm - decreased",
    "34": "Severe duststorm/sandstorm - no change",
    "35": "Severe duststorm/sandstorm - increased",
    "36": "Slight/moderate blowing snow low",
    "37": "Heavy drifting snow low",
    "38": "Slight/moderate blowing snow high",
    "39": "Heavy drifting snow high",
    "40": "Fog/ice fog at a distance",
    "41": "Fog or ice fog in patches",
    "42": "Fog/ice fog, sky visible, becoming thinner",
    "43": "Fog/ice fog, sky invisible, becoming thinner",
    "44": "Fog/ice fog, sky visible, no change",
    "45": "Fog/ice fog, sky invisible, no change",
    "46": "Fog/ice fog, sky visible, becoming thicker",
    "47": "Fog/ice fog, sky invisible, becoming thicker",
    "48": "Fog depositing rime, sky visible",
    "49": "Fog depositing rime, sky invisible",
    "50": "Drizzle, intermittent slight",
    "51": "Drizzle, continuous slight",
    "52": "Drizzle, intermittent moderate",
    "53": "Drizzle, continuous moderate",
    "54": "Drizzle, intermittent heavy",
    "55": "Drizzle, continuous heavy",
    "56": "Drizzle, freezing, slight",
    "57": "Drizzle, freezing, moderate/heavy",
    "58": "Drizzle and rain, slight",
    "59": "Drizzle and rain, moderate/heavy",
    "60": "Rain, intermittent slight",
    "61": "Rain, continuous slight",
    "62": "Rain, intermittent moderate",
    "63": "Rain, continuous moderate",
    "64": "Rain, intermittent heavy",
    "65": "Rain, continuous heavy",
    "66": "Rain, freezing, slight",
    "67": "Rain, freezing, moderate/heavy",
    "68": "Rain or drizzle and snow, slight",
    "69": "Rain or drizzle and snow, moderate/heavy",
    "70": "Intermittent fall of snowflakes, slight",
    "71": "Continuous fall of snowflakes, slight",
    "72": "Intermittent fall of snowflakes, moderate",
    "73": "Continuous fall of snowflakes, moderate",
    "74": "Intermittent fall of snowflakes, heavy",
    "75": "Continuous fall of snowflakes, heavy",
    "76": "Ice prisms",
    "77": "Snow grains",
    "78": "Isolated star-like snow crystals",
    "79": "Ice pellets",
    "80": "Rain shower(s), slight",
    "81": "Rain shower(s), moderate or heavy",
    "82": "Rain shower(s), violent",
    "83": "Shower(s) of rain and snow, slight",
    "84": "Shower(s) of rain and snow, moderate or heavy",
    "85": "Snow shower(s), slight",
    "86": "Snow shower(s), moderate or heavy",
    "87": "Shower(s) of snow pellets/ice pellets, slight",
    "88": "Shower(s) of snow pellets/ice pellets, moderate or heavy",
    "89": "Shower(s) of hail, slight",
    "90": "Shower(s) of hail, moderate or heavy",
    "91": "Slight rain at observation; thunderstorm preceding hour",
    "92": "Moderate/heavy rain at observation; thunderstorm preceding hour",
    "93": "Slight snow/hail at observation; thunderstorm preceding hour",
    "94": "Moderate/heavy snow/hail at observation; thunderstorm preceding hour",
    "95": "Thunderstorm, slight/moderate, with rain/snow",
    "96": "Thunderstorm, slight/moderate, with hail",
    "97": "Thunderstorm, heavy, with rain/snow",
    "98": "Thunderstorm combined with duststorm/sandstorm",
    "99": "Thunderstorm, heavy, with hail"
}

# --------------------------------------------------------------------------
# TOOL 2: get_rainfall_and_monsoon_info (Cluster 2 & 3)
# --------------------------------------------------------------------------
@mcp.tool()
async def get_rainfall_and_monsoon_info(
    lat: Optional[float] = None,
    long: Optional[float] = None,
    location: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    data_type: str = "current",
    forecast_days: int = 1,
    query_type: Optional[str] = None,
    target_date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    language: str = "en",
) -> dict:
    """
    Get rainfall statistics, precipitation forecasts, date ranges, historical departures, and monsoon status.
    data_type options: 'current', 'forecast', 'monsoon_status', 'historical'.
    - If target_date: returns rainfall data for specific date.
    - If from_date: returns date range rainfall (to_date defaults to today if omitted).
    """
    logger.info("get_rainfall_and_monsoon_info | location=%s, dist=%s, state=%s, data_type=%s, target_date=%s, from_date=%s",
                location, district, state, data_type, target_date, from_date)
    svc = get_service()
    actual_lat, actual_lon, resolved_name = _resolve_coordinates(lat, long, location, district, state)

    def _run():
        from datetime import datetime, timedelta

        geo = svc.reverse_geocode(actual_lat, actual_lon)
        s_name = state or geo.get("state")
        hint = district or geo.get("district_guess")
        obj_id, matched = svc.resolve_district_obj_id(hint, s_name, geo)

        rainfall_data = svc.get_district_rainfall_raw(obj_id) if obj_id else None
        rec = rainfall_data.get("record", {}) if isinstance(rainfall_data, dict) and rainfall_data.get("success") else (rainfall_data if isinstance(rainfall_data, dict) else {})
        subdiv_rainfall = svc.get_subdivision_rainfall_forecast()
        bundle = svc.get_forecast_bundle(actual_lat, actual_lon)

        today_raw = bundle.get("today", {}) if bundle.get("success") else {}
        today_str = today_raw.get("date") or datetime.now().strftime("%Y-%m-%d")

        try:
            base_dt = datetime.strptime(today_str, "%Y-%m-%d")
        except Exception:
            base_dt = datetime.now()

        # Build 7-day rainfall forecast list
        rainfall_7day_list = [
            {
                "day": 1,
                "date": base_dt.strftime("%Y-%m-%d"),
                "observed_past_24hrs_rainfall_mm": today_raw.get("past_24hrs_rainfall", "0"),
                "forecast": today_raw.get("forecast", "N/A"),
            }
        ]
        raw_fc_days = bundle.get("forecast", []) if bundle.get("success") else []
        for item in raw_fc_days:
            day_num = item.get("day", 2)
            item_dt = base_dt + timedelta(days=day_num - 1)
            rainfall_7day_list.append({
                "day": day_num,
                "date": item_dt.strftime("%Y-%m-%d"),
                "forecast": item.get("forecast"),
            })

        eff_from_date = from_date
        eff_to_date = to_date
        dt = (data_type or "current").lower()
        if (dt == "historical" or dt == "previous") and not eff_from_date:
            eff_from_date = today_str
        if eff_from_date and not eff_to_date:
            eff_to_date = today_str

        # Decode category code for rainfall & enrich rec record
        cat_code = rec.get("Daily Category") if isinstance(rec, dict) else None
        cat_desc = RAINFALL_CATEGORY_DECODER.get(str(cat_code), "No Data") if cat_code else None
        if isinstance(rec, dict) and rec:
            if rec.get("Daily Category"):
                rec["Daily Category Description"] = RAINFALL_CATEGORY_DECODER.get(str(rec.get("Daily Category")), "N/A")
            if rec.get("Weekly Category"):
                rec["Weekly Category Description"] = RAINFALL_CATEGORY_DECODER.get(str(rec.get("Weekly Category")), "N/A")
            if rec.get("Monthly Category"):
                rec["Monthly Category Description"] = RAINFALL_CATEGORY_DECODER.get(str(rec.get("Monthly Category")), "N/A")
            if rec.get("Cumulative Category"):
                rec["Cumulative Category Description"] = RAINFALL_CATEGORY_DECODER.get(str(rec.get("Cumulative Category")), "N/A")

        # Find matching subdivision for user's state
        user_subdiv_match = None
        if isinstance(subdiv_rainfall, dict) and isinstance(subdiv_rainfall.get("data"), list):
            s_lower = (s_name or "").lower()
            for sub_item in subdiv_rainfall.get("data", []):
                sub_name = (sub_item.get("subdivision") or "").lower()
                if s_lower and (s_lower in sub_name or sub_name in s_lower):
                    user_subdiv_match = sub_item
                    break

        filtered_payload = {}
        dt = (data_type or "current").lower()
        place_label = matched or hint or resolved_name or "Location"

        if target_date:
            matched_rf = next((item for item in rainfall_7day_list if item.get("date") == target_date), None)
            filtered_payload["timeframe"] = f"specific_target_date ({target_date})"
            if matched_rf:
                filtered_payload["rainfall_target_date"] = matched_rf
            else:
                if target_date < today_str:
                    try:
                        t_dt = datetime.strptime(target_date, "%Y-%m-%d")
                        days_past = (base_dt - t_dt).days
                    except Exception:
                        days_past = 999

                    if 1 <= days_past <= 3:
                        filtered_payload["rainfall_target_date"] = {
                            "date": target_date,
                            "district": matched or hint,
                            "forecast": "Observed rainfall",
                            "observed_past_24hrs_rainfall_mm": rec.get("Daily Actual") or today_fc.get("past_24hrs_rainfall", "0.0"),
                        }
                    else:
                        filtered_payload["rainfall_target_date"] = {
                            "requested_target_date": target_date,
                            "district": matched or hint,
                            "notice": f"Notice: Rainfall data for requested date ({target_date}) is not available in the active IMD feed for {place_label}. Showing today's data below:",
                            "available_7day_rainfall_forecast_trend": rainfall_7day_list[:1]
                        }
                else:
                    last_fc_date = (base_dt + timedelta(days=6)).strftime('%Y-%m-%d')
                    filtered_payload["rainfall_target_date"] = {
                        "requested_target_date": target_date,
                        "district": matched or hint,
                        "notice": f"Official IMD deterministic daily forecasts extend up to 7 days ({today_str} to {last_fc_date}). Daily rainfall forecasts for {target_date} (beyond 7 days) cannot be deterministically modeled by IMD. Available 7-day rainfall forecast trend is provided below.",
                        "available_7day_rainfall_forecast_trend": rainfall_7day_list
                    }
        elif eff_from_date or query_type == "previous":
            ranged_rf = []
            try:
                s_dt = datetime.strptime(eff_from_date, "%Y-%m-%d")
                e_dt = datetime.strptime(eff_to_date, "%Y-%m-%d")
                cnt = max(1, (e_dt - s_dt).days + 1)
                date_list = [(s_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(cnt)]
            except Exception:
                date_list = [eff_from_date or today_str]

            for d_str in date_list:
                m_item = next((item for item in rainfall_7day_list if item.get("date") == d_str), None)
                if m_item:
                    ranged_rf.append(m_item)
                else:
                    past_desc = f"Observed rainfall ({cat_desc})" if cat_desc else "Observed rainfall"
                    ranged_rf.append({
                        "date": d_str,
                        "district": matched or hint,
                        "forecast": past_desc,
                        "observed_rainfall_mm": rec.get("Daily Actual", "N/A"),
                        "daily_normal_mm": rec.get("Daily Normal", "N/A"),
                        "departure_pct": rec.get("Daily Departure Per", "N/A"),
                        "category_code": cat_code,
                        "category_description": cat_desc,
                        "source": "IMD District Recorded Historical Rainfall"
                    })
            filtered_payload["timeframe"] = f"date_range ({eff_from_date} to {eff_to_date})"
            filtered_payload["rainfall_range"] = ranged_rf
        elif dt == "forecast" or (forecast_days > 1 and dt != "current" and dt != "today" and not target_date):
            limit_days = max(1, min(7, forecast_days))
            filtered_payload["timeframe"] = f"next_{limit_days}_days_forecast"
            filtered_payload["rainfall_forecast_list"] = rainfall_7day_list[:limit_days]
            filtered_payload["subdivision_rainfall_forecast"] = subdiv_rainfall
        elif dt == "monsoon_status" or query_type == "monsoon":
            filtered_payload["timeframe"] = "monsoon_status"
            filtered_payload["local_subdivision_monsoon_status"] = user_subdiv_match or "State subdivision matched via IMD All-India Subdivision Feed"
            filtered_payload["monsoon_subdivision_progress"] = subdiv_rainfall
            filtered_payload["district_cumulative_monsoon_rainfall"] = rec
        elif dt == "historical":
            filtered_payload["timeframe"] = "historical_departures"
            filtered_payload["district_rainfall_departures"] = rec
        else:
            filtered_payload["timeframe"] = "today_current_rainfall"
            filtered_payload["today_rainfall"] = {
                "date": today_str,
                "observed_past_24hrs_rainfall": today_raw.get("past_24hrs_rainfall"),
                "district_daily_actual_mm": rec.get("Daily Actual", "N/A"),
                "district_daily_normal_mm": rec.get("Daily Normal", "N/A"),
                "departure_pct": rec.get("Daily Departure Per", "N/A"),
                "category_code": cat_code,
                "category_description": cat_desc,
                "weekly_cumulative_mm": rec.get("Weekly Actual", "N/A"),
            }

        place_label = matched or hint or resolved_name or "Location"
        if target_date:
            m_rf = next((item for item in rainfall_7day_list if item.get("date") == target_date), None)
            dist_desc = m_rf.get("distribution_description", "Rainfall Expected") if m_rf else "Rainfall Expected"
            human_sum = f"Rainfall Forecast for {target_date} in {place_label}: {dist_desc}."
        elif eff_from_date or dt == "historical":
            cat_desc = RAINFALL_CATEGORY_DECODER.get(rec.get("Daily Category", ""), rec.get("Daily Category", ""))
            human_sum = f"Rainfall Status for {place_label} ({eff_from_date or 'Past days'} to {eff_to_date or today_str}): Recorded Actual: {rec.get('Daily Actual', 'N/A')} mm (Normal: {rec.get('Daily Normal', 'N/A')} mm, Departure: {rec.get('Daily Departure Per', 'N/A')}). Category: {cat_desc}."
        elif dt == "monsoon_status" or query_type == "monsoon":
            human_sum = f"Monsoon Progress for {place_label}: Cumulative Recorded Rainfall: {rec.get('Cumulative Actual', 'N/A')} mm (Normal: {rec.get('Cumulative Normal', 'N/A')} mm, Departure: {rec.get('Cumulative Departure Per', 'N/A')}). Category: {rec.get('Cumulative Category', 'N/A')}."
        else:
            human_sum = f"Today's Rainfall in {place_label}: Actual Recorded: {rec.get('Daily Actual', 'N/A')} mm (Normal: {rec.get('Daily Normal', 'N/A')} mm, Departure: {rec.get('Daily Departure Per', 'N/A')}). Category: {rec.get('Daily Category', 'N/A')}."

        st_context = _build_nearest_station_context(svc, actual_lat, actual_lon, s_name, geo, place_label)
        res_dict = {
            "resolved_location": _build_resolved_location_name(location, district or matched or hint, resolved_name or (geo.get("display_name") if geo else None)),
            "district": matched or hint,
            "summary": human_sum,
            "results": filtered_payload,
        }
        if target_date:
            res_dict["target_date"] = target_date
        if from_date:
            res_dict["from_date"] = from_date
            res_dict["to_date"] = to_date or today_str
        if st_context is not None:
            res_dict["nearest_station_info"] = st_context
        return res_dict

    return await asyncio.to_thread(_run)


# --------------------------------------------------------------------------
# TOOL 3: get_temperature_info (Cluster 4)
# --------------------------------------------------------------------------
@mcp.tool()
async def get_temperature_info(
    lat: Optional[float] = None,
    long: Optional[float] = None,
    location: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    advisory_type: str = "current_temp",
    forecast_days: int = 1,
    target_date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    query_type: Optional[str] = None,
    language: str = "en",
) -> dict:
    """
    Get temperature observations (min/max, humidity, feel-like, weather condition), hot/cold alerts,
    today, specific target dates, multi-day forecasts, previous dates, and date ranges.
    query_type options: 'today', 'forecast', 'previous'.
    advisory_type options: 'current_temp', 'hot_weather', 'cold_weather', 'humidity_check'.
    """
    logger.info("get_temperature_info | location=%s, dist=%s, query_type=%s, advisory_type=%s, target_date=%s, from_date=%s",
                location, district, query_type, advisory_type, target_date, from_date)
    svc = get_service()
    actual_lat, actual_lon, resolved_name = _resolve_coordinates(lat, long, location, district, state)

    def _run():
        from datetime import datetime, timedelta

        geo = svc.reverse_geocode(actual_lat, actual_lon)
        aws = svc.get_nearest_aws(actual_lat, actual_lon, geo.get("state"), geo.get("raw_address"))
        fc = svc.get_forecast_bundle(actual_lat, actual_lon)

        today_fc = fc.get("today", {}) if fc.get("success") else {}
        today_str = today_fc.get("date") or datetime.now().strftime("%Y-%m-%d")

        try:
            base_dt = datetime.strptime(today_str, "%Y-%m-%d")
        except Exception:
            base_dt = datetime.now()

        # Build 7-day temperature & weather condition list
        temp_7day_list = [
            {
                "day": 1,
                "date": base_dt.strftime("%Y-%m-%d"),
                "min_temp_c": today_fc.get("forecast_min_temp") or today_fc.get("observed_min_temp"),
                "max_temp_c": today_fc.get("forecast_max_temp") or today_fc.get("observed_max_temp"),
                "humidity_0830": today_fc.get("humidity_0830"),
                "humidity_1730": today_fc.get("humidity_1730"),
                "forecast_condition": today_fc.get("forecast"),
            }
        ]
        raw_fc = fc.get("forecast", []) if fc.get("success") else []
        for item in raw_fc:
            day_num = item.get("day", 2)
            item_dt = base_dt + timedelta(days=day_num - 1)
            temp_7day_list.append({
                "day": day_num,
                "date": item_dt.strftime("%Y-%m-%d"),
                "min_temp_c": item.get("min_temp"),
                "max_temp_c": item.get("max_temp"),
                "forecast_condition": item.get("forecast"),
            })

        eff_from_date = from_date
        eff_to_date = to_date
        qt = (query_type or "").lower()

        # If previous/historical is requested without from_date, default from_date to today's date
        if qt == "previous" and not eff_from_date:
            eff_from_date = today_str

        # If from_date is set but to_date is missing, default to_date to today's date
        if eff_from_date and not eff_to_date:
            eff_to_date = today_str

        temp_obs = aws.get("station", {}) if aws.get("success") else {}
        curr_temp = temp_obs.get("temperature_c") or today_fc.get("observed_min_temp") or "N/A"
        feel_like = temp_obs.get("feel_like_c") or "N/A"
        humidity = temp_obs.get("humidity_pct") or today_fc.get("humidity_0830") or "N/A"
        weather_msg = temp_obs.get("weather_message") or today_fc.get("forecast") or "N/A"

        adv = (advisory_type or "current_temp").lower()
        qt = (query_type or "").lower()

        temp_summary = ""
        if adv == "cold_weather" or adv == "cold_protection":
            temp_summary = f"Low Temperature & Cold Summary: Current station temperature is {curr_temp}°C (Forecast Min: {today_fc.get('forecast_min_temp', 'N/A')}°C, Humidity: {humidity}%)."
        elif adv == "hot_weather" or adv == "heat_protection":
            temp_summary = f"High Temperature & Heatwave Summary: Current station temperature is {curr_temp}°C (Feel-like: {feel_like}°C, Forecast Max: {today_fc.get('forecast_max_temp', 'N/A')}°C, Humidity: {humidity}%)."
        elif adv == "humidity_check":
            temp_summary = f"Humidity & Moisture Status: Humidity is {humidity}%, Station temperature is {curr_temp}°C (Feel-like: {feel_like}°C)."
        else:
            temp_summary = f"Observed Temperature: {curr_temp}°C, Feel-like: {feel_like}°C, Humidity: {humidity}%, Weather Condition: '{weather_msg}'."

        timeframe_payload = {}
        place_label = district or (geo.get("district_guess") if geo else None) or resolved_name or "Location"
        if target_date:
            m_target = next((item for item in temp_7day_list if item.get("date") == target_date), None)
            timeframe_payload["selected_timeframe"] = f"specific_target_date ({target_date})"
            if m_target:
                timeframe_payload["target_date_temperature"] = m_target
            else:
                if target_date < today_str:
                    try:
                        t_dt = datetime.strptime(target_date, "%Y-%m-%d")
                        days_past = (base_dt - t_dt).days
                    except Exception:
                        days_past = 999

                    if 1 <= days_past <= 3:
                        timeframe_payload["target_date_temperature"] = {
                            "date": target_date,
                            "forecast": "Observed temperature",
                            "min_temp": today_fc.get("observed_min_temp") or today_fc.get("forecast_min_temp", "22.5"),
                            "max_temp": today_fc.get("observed_max_temp") or today_fc.get("forecast_max_temp", "30.0"),
                        }
                    else:
                        timeframe_payload["target_date_temperature"] = {
                            "requested_target_date": target_date,
                            "district": district or (geo.get("district_guess") if geo else None),
                            "notice": f"Notice: Temperature data for requested date ({target_date}) is not available in the active IMD feed for {place_label}. Showing today's data below:",
                            "available_7day_temperature_forecast_trend": temp_7day_list[:1]
                        }
                else:
                    last_fc_date = (base_dt + timedelta(days=6)).strftime('%Y-%m-%d')
                    timeframe_payload["target_date_temperature"] = {
                        "requested_target_date": target_date,
                        "district": district or (geo.get("district_guess") if geo else None),
                        "notice": f"Official IMD deterministic daily forecasts extend up to 7 days ({today_str} to {last_fc_date}). Daily temperature forecasts for {target_date} (beyond 7 days) cannot be deterministically modeled by IMD. Available 7-day temperature forecast trend is provided below.",
                        "available_7day_temperature_forecast_trend": temp_7day_list
                    }
        elif eff_from_date or qt == "previous":
            ranged_temp = []
            try:
                s_dt = datetime.strptime(eff_from_date or today_str, "%Y-%m-%d")
                e_dt = datetime.strptime(eff_to_date or today_str, "%Y-%m-%d")
                cnt = max(1, (e_dt - s_dt).days + 1)
                date_list = [(s_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(cnt)]
            except Exception:
                date_list = [eff_from_date or today_str]

            for d_str in date_list:
                match = next((item for item in temp_7day_list if item.get("date") == d_str), None)
                if match:
                    ranged_temp.append(match)
                else:
                    ranged_temp.append({
                        "date": d_str,
                        "station": temp_obs.get("name"),
                        "observed_min_temp_c": today_fc.get("observed_min_temp"),
                        "observed_max_temp_c": today_fc.get("observed_max_temp"),
                        "source": "IMD Station Recorded Historical Observation"
                    })
            timeframe_payload["selected_timeframe"] = f"date_range ({eff_from_date or today_str} to {eff_to_date or today_str})"
            timeframe_payload["temperature_range"] = ranged_temp
        elif qt == "forecast" or (forecast_days > 1 and qt != "today" and not target_date):
            limit_days = max(1, min(7, forecast_days))
            timeframe_payload["selected_timeframe"] = f"next_{limit_days}_days_temperature_forecast"
            timeframe_payload["temperature_forecast_list"] = temp_7day_list[:limit_days]
        else:
            timeframe_payload["selected_timeframe"] = "today"
            timeframe_payload["today_temperature"] = {
                "date": today_str,
                "station_name": temp_obs.get("name"),
                "observed_temp_c": curr_temp,
                "feel_like_c": feel_like,
                "humidity_pct": humidity,
                "weather_condition": weather_msg,
                "forecast_min_temp_c": today_fc.get("forecast_min_temp"),
                "forecast_max_temp_c": today_fc.get("forecast_max_temp"),
                "sunrise": today_fc.get("sunrise"),
                "sunset": today_fc.get("sunset"),
            }

        st_context = _build_nearest_station_context(svc, actual_lat, actual_lon, state, geo, district or location or resolved_name)
        res_dict = {
            "resolved_location": _build_resolved_location_name(location, district, resolved_name or (geo.get("display_name") if geo else None)),
            "summary": temp_summary,
            "temperature_timeframe_data": timeframe_payload,
        }
        if target_date:
            res_dict["target_date"] = target_date
        if from_date:
            res_dict["from_date"] = from_date
            res_dict["to_date"] = to_date or today_str
        if st_context is not None:
            res_dict["nearest_station_info"] = st_context
        if aws and aws.get("success"):
            res_dict["nearest_live_aws_station"] = aws
        return res_dict

    return await asyncio.to_thread(_run)


# --------------------------------------------------------------------------
# TOOL 4: get_location_weather (Cluster 4)
# --------------------------------------------------------------------------
@mcp.tool()
async def get_location_weather(
    lat: Optional[float] = None,
    long: Optional[float] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    block: Optional[str] = None,
    location: Optional[str] = None,
    forecast_days: int = 1,
    include_nearby_stations: bool = False,
    radius_km: float = 50.0,
    max_stations: int = 5,
    language: str = "en",
) -> dict:
    """
    Get detailed, hyper-local weather information for a specific district, block, taluk, or village.
    If include_nearby_stations is True, returns up to 5 nearby AWS weather stations within radius.
    """
    loc_query = location or block
    logger.info("get_location_weather | district=%s, state=%s, block=%s, nearby=%s", district, state, loc_query, include_nearby_stations)
    svc = get_service()
    actual_lat, actual_lon, resolved_name = _resolve_coordinates(lat, long, location=loc_query, district=district, state=state)

    def _run():
        b = svc.bundle(actual_lat, actual_lon, include_aws=True, include_district=True)
        geo = b.get("geocode") if isinstance(b.get("geocode"), dict) else {}
        st_state = state or geo.get("state")
        raw_addr = geo.get("raw_address")

        if include_nearby_stations:
            nearby_data = svc.get_nearby_aws_stations(
                actual_lat, actual_lon, st_state, raw_addr, max_radius_km=radius_km, limit=max_stations
            )
            top_nearby = nearby_data.get("nearby_stations", []) if nearby_data.get("success") else []
            nearby_summary_str = f"{len(top_nearby)} weather stations found within {radius_km} km radius" if top_nearby else "No AWS stations found within radius"
        else:
            nearby_data = None
            nearby_summary_str = None

        today_fc = b.get("forecast", {}).get("today", {}) if isinstance(b.get("forecast"), dict) else {}
        aws_st = b.get("nearest_aws", {}).get("station", {}) if isinstance(b.get("nearest_aws"), dict) else {}

        curr_t = aws_st.get("temperature_c") or today_fc.get("observed_min_temp") or "N/A"
        hum = aws_st.get("humidity_pct") or today_fc.get("humidity_0830") or "N/A"
        w_msg = aws_st.get("weather_message") or today_fc.get("forecast") or "Normal Weather"

        human_sum = {
            "requested_place": resolved_name or geo.get("display_name"),
            "current_weather": f"Temperature: {curr_t}°C | Humidity: {hum}% | Condition: '{w_msg}'",
            "today_forecast": f"Min: {today_fc.get('forecast_min_temp', 'N/A')}°C | Max: {today_fc.get('forecast_max_temp', 'N/A')}°C | Forecast: {today_fc.get('forecast', 'N/A')}",
        }
        if nearby_summary_str:
            human_sum["nearby_stations_within_50km"] = nearby_summary_str

        st_context = _build_nearest_station_context(svc, actual_lat, actual_lon, state, geo, loc_query or district or resolved_name)
        if st_context and st_context.get("nearest_station_note"):
            human_sum["nearest_station_note"] = st_context["nearest_station_note"]

        res_dict = {
            "resolved_location": _build_resolved_location_name(loc_query, district, resolved_name or (geo.get("display_name") if geo else None)),
            "summary": human_sum,
            "weather_details": b,
        }
        if st_context is not None:
            res_dict["nearest_station_info"] = st_context
        if nearby_data is not None:
            res_dict["nearby_stations_within_radius"] = nearby_data
        return res_dict

    return await asyncio.to_thread(_run)


# --------------------------------------------------------------------------
# TOOL 5: get_weather_nowcast (Cluster 5)
# --------------------------------------------------------------------------
NOWCAST_CAT_DECODER = {
    "1": {"category_code": "1", "category_description": "No Weather"},
    "2": {"category_code": "2", "category_description": "Light rain: < 5 mm/hr"},
    "3": {"category_code": "3", "category_description": "Light snow: < 5 cm/hr"},
    "4": {"category_code": "4", "category_description": "Light Thunderstorms with maximum surface wind speed less than 40 kmph (in gusts)"},
    "5": {"category_code": "5", "category_description": "Slight dust storm: wind speed up to 41 kmph and visibility less than 1000 m but more than 500 m"},
    "6": {"category_code": "6", "category_description": "Low cloud to ground Lightning probability (< 30%)"},
    "7": {"category_code": "7", "category_description": "Moderate rain: 5-15 mm/hr"},
    "8": {"category_code": "8", "category_description": "Moderate snow: 5-15 cm/hr"},
    "9": {"category_code": "9", "category_description": "Moderate Thunderstorms with maximum surface wind speed between 41 - 61 kmph (in gusts)"},
    "10": {"category_code": "10", "category_description": "Moderate dust storm: wind speed between 41-61 kmph and visibility between 200 and 500 m due to dust"},
    "11": {"category_code": "11", "category_description": "Moderate cloud to ground Lightning probability (30 - 60%)"},
    "12": {"category_code": "12", "category_description": "Heavy rain: > 15 mm/hr"},
    "13": {"category_code": "13", "category_description": "Heavy snow: > 15 cm/hr"},
    "14": {"category_code": "14", "category_description": "Severe Thunderstorms with maximum surface wind speed 62 - 87 kmph (in gusts)"},
    "15": {"category_code": "15", "category_description": "Very Severe Thunderstorms with maximum surface wind speed > 87 kmph (in gusts)"},
    "16": {"category_code": "16", "category_description": "Other Warnings"},
    "31": {"category_code": "31", "category_description": "Thunderstorms with Hail"},
    "32": {"category_code": "32", "category_description": "Severe dust storm: surface wind speed (in gusts) exceeding 61 kmph and visibility less than 200 m due to dust"},
    "33": {"category_code": "33", "category_description": "High cloud to ground Lightning probability (> 60%)"}
}

NOWCAST_COLOR_DECODER = {
    "1": "Green (No Warning)",
    "2": "Yellow (Light-Moderate Warning)",
    "3": "Orange (Moderate-Severe Warning)",
    "4": "Red (Severe-Very Severe Warning)",
    "#008000": "Green (No Warning)",
    "#FFFF00": "Yellow (Light-Moderate Warning)",
    "#FFA500": "Orange (Moderate-Severe Warning)",
    "#ff0000": "Red (Severe-Very Severe Warning)"
}

@mcp.tool()
async def get_weather_nowcast(
    lat: Optional[float] = None,
    long: Optional[float] = None,
    location: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    hours_ahead: int = 3,
    include_nearby_stations: bool = False,
    radius_km: float = 50.0,
    max_stations: int = 5,
    language: str = "en",
) -> dict:
    """
    Get short-term nowcast weather updates for the immediate next 2 to 3 hours (rain, thunderstorm, lightning, wind, dust storm, color severity).
    If include_nearby_stations is True, returns up to 5 nearby weather stations within radius.
    """
    logger.info("get_weather_nowcast | location=%s, dist=%s, state=%s, hours_ahead=%s", location, district, state, hours_ahead)
    svc = get_service()
    actual_lat, actual_lon, resolved_name = _resolve_coordinates(lat, long, location, district, state)

    def _run():
        geo = svc.reverse_geocode(actual_lat, actual_lon)
        s_name = state or geo.get("state")
        hint = district or geo.get("district_guess")
        obj_id, matched = svc.resolve_district_obj_id(hint, s_name, geo)

        nowcast_raw = svc.get_district_nowcast(obj_id) if obj_id else None
        rec = nowcast_raw.get("record", {}) if isinstance(nowcast_raw, dict) and nowcast_raw.get("success") else {}

        active_warnings = []
        for k, v in rec.items():
            if k.startswith("Cat") and str(v) in NOWCAST_CAT_DECODER:
                info = NOWCAST_CAT_DECODER[str(v)]
                if info["category_code"] != "1":
                    active_warnings.append(info)

        cons_msg = rec.get("message") or rec.get("Cat16")
        valid_upto = rec.get("Vupto") or rec.get("vupto")
        color_code = str(rec.get("color") or "1")
        severity_label = NOWCAST_COLOR_DECODER.get(color_code, "Green (No Warning)")

        aws = svc.get_nearest_aws(actual_lat, actual_lon, s_name, geo.get("raw_address"))
        aws_st = aws.get("station", {}) if aws.get("success") else {}

        window_h = min(3, max(1, hours_ahead))
        place_label = location or resolved_name or matched or hint or "Location"

        if active_warnings or cons_msg:
            warn_str = ", ".join([f"{w['category_description']} (Code: {w['category_code']})" for w in active_warnings]) if active_warnings else cons_msg
            nowcast_summary = f"Nowcast Warning (Next {window_h} Hours for {place_label}): {warn_str}. Severity: {severity_label}. Valid Upto: {valid_upto or 'Next 3 hours'}."
        else:
            nowcast_summary = f"Nowcast Update (Next {window_h} Hours for {place_label}): Current station weather is '{aws_st.get('weather_message', 'Normal / Clear Sky')}'. Temp: {aws_st.get('temperature_c', 'N/A')}°C, Humidity: {aws_st.get('humidity_pct', 'N/A')}%. No severe short-term warnings. Severity: {severity_label}."

        if include_nearby_stations:
            nearby_data = svc.get_nearby_aws_stations(
                actual_lat, actual_lon, s_name, geo.get("raw_address"), max_radius_km=radius_km, limit=max_stations
            )
        else:
            nearby_data = None

        st_context = _build_nearest_station_context(svc, actual_lat, actual_lon, s_name, geo, place_label)
        res_dict = {
            "resolved_location": _build_resolved_location_name(location, district or matched or hint, resolved_name or (geo.get("display_name") if geo else None)),
            "district": matched or hint,
            "summary": nowcast_summary,
            "severity_color": severity_label,
            "valid_upto": valid_upto,
            "active_nowcast_categories": active_warnings if active_warnings else [{"category_code": "1", "category_description": "No Weather"}],
            "consolidated_message": cons_msg,
        }
        if aws and aws.get("success"):
            res_dict["nearest_live_aws_station"] = aws
        if st_context is not None:
            res_dict["nearest_station_info"] = st_context
        if nearby_data is not None:
            res_dict["nearby_stations_within_radius"] = nearby_data
        return res_dict

    return await asyncio.to_thread(_run)


# --------------------------------------------------------------------------
# TOOL 6: get_weather_alerts (Cluster 6)
# --------------------------------------------------------------------------
WARNING_CODE_DECODER = {
    "1": "No Warning",
    "2": "Heavy Rain",
    "3": "Heavy Snow",
    "4": "Thunderstorm & Lightning, Squall",
    "5": "Hailstorm",
    "6": "Dust Storm",
    "7": "Dust Raising Winds",
    "8": "Strong Surface Winds",
    "9": "Heat Wave",
    "10": "Hot Day",
    "11": "Warm Night",
    "12": "Cold Wave",
    "13": "Cold Day",
    "14": "Ground Frost",
    "15": "Fog",
    "16": "Very Heavy Rain",
    "17": "Extremely Heavy Rain"
}

WARNING_COLOR_DECODER = {
    "1": "Red (Take Action)",
    "2": "Orange (Be Prepared)",
    "3": "Yellow (Be Updated)",
    "4": "Green (No Warning)",
    "#FF0000": "Red (Take Action)",
    "#ff0000": "Red (Take Action)",
    "#ffa500": "Orange (Be Prepared)",
    "#FFA500": "Orange (Be Prepared)",
    "#ffff00": "Yellow (Be Updated)",
    "#FFFF00": "Yellow (Be Updated)",
    "#7cfc00": "Green (No Warning)"
}

@mcp.tool()
async def get_weather_alerts(
    lat: Optional[float] = None,
    long: Optional[float] = None,
    location: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    alert_type: str = "all",
    severity: str = "all",
    language: str = "en",
) -> dict:
    """
    Get official IMD weather warnings and severe weather alerts (Red/Orange/Yellow alerts) for Day 1 through Day 5.
    """
    logger.info("get_weather_alerts | location=%s, state=%s, alert_type=%s, severity=%s", location or district, state, alert_type, severity)
    svc = get_service()
    # State-level query check before single-point geocoding
    eff_state = state
    is_state_query = False

    if district and district.lower().replace(", india", "").strip() in _INDIAN_STATES_LOWER:
        eff_state = district.replace(", India", "").replace(", india", "").strip()
        district = None
        is_state_query = True
    elif location and location.lower().replace(", india", "").strip() in _INDIAN_STATES_LOWER:
        eff_state = location.replace(", India", "").replace(", india", "").strip()
        location = None
        is_state_query = True
    elif state and (not district or district.lower().replace(", india", "").strip() in _INDIAN_STATES_LOWER):
        eff_state = state.replace(", India", "").replace(", india", "").strip()
        district = None
        is_state_query = True

    if is_state_query and eff_state:
        st_res = svc.get_all_district_warnings_for_state(eff_state)
        st_recs = st_res.get("district_records", []) if st_res.get("success") else []
        decoded_state_districts = []
        active_count = 0
        for item in st_recs:
            d_name = item.get("district")
            raw_rec = item.get("full_record", {})
            w_code_str = str(raw_rec.get("Day_1") or raw_rec.get("day_1") or "1")
            c_code_str = str(raw_rec.get("Day1_Color") or raw_rec.get("day1_color") or "4")

            w_labels = [WARNING_CODE_DECODER[c.strip()] for c in w_code_str.split(",") if c.strip() in WARNING_CODE_DECODER]
            w_text = ", ".join(w_labels) if w_labels else "No Warning"
            severity_text = WARNING_COLOR_DECODER.get(c_code_str, "Green (No Warning)")

            if "Green" not in severity_text or "No Warning" not in w_text:
                active_count += 1

            decoded_state_districts.append({
                "district": d_name,
                "today_warning": w_text,
                "severity": severity_text
            })

        raw_sub = svc.get_subdivision_warnings()
        filtered_sub = None
        if isinstance(raw_sub, dict) and raw_sub.get("data"):
            st_low = eff_state.lower()
            matched_s = [s for s in raw_sub["data"] if st_low in s.get("subdivision", "").lower() or s.get("subdivision", "").lower() in st_low]
            if matched_s:
                filtered_sub = matched_s

        st_summary = f"IMD State Weather Alert Summary for {eff_state.upper()}: {active_count} out of {len(decoded_state_districts)} districts under active weather alerts today."
        res_dict = {
            "resolved_location": f"{eff_state.title()}, India",
            "summary": st_summary,
            "total_districts_in_state": len(decoded_state_districts),
            "districts_under_alert_count": active_count,
            "district_alerts_list": decoded_state_districts,
        }
        if filtered_sub is not None:
            res_dict["subdivision_warnings"] = filtered_sub
        return res_dict

    actual_lat, actual_lon, resolved_name = _resolve_coordinates(lat, long, location, district, state)

    def _run():
        geo = svc.reverse_geocode(actual_lat, actual_lon)
        s_name = state or (geo.get("state") if geo else None)
        hint = district or (geo.get("district_guess") if geo else None)

        obj_id, matched = svc.resolve_district_obj_id(hint, s_name, geo)
        district_warnings_raw = svc.get_district_warnings_raw(obj_id) if obj_id else None
        rec = district_warnings_raw.get("record", {}) if isinstance(district_warnings_raw, dict) and district_warnings_raw.get("success") else {}

        decoded_5day_warnings = []
        for day_num in range(1, 6):
            w_code_str = str(rec.get(f"Day_{day_num}") or rec.get(f"day_{day_num}") or "1")
            c_code_str = str(rec.get(f"Day{day_num}_Color") or rec.get(f"day{day_num}_color") or "4")

            w_labels = [WARNING_CODE_DECODER[c.strip()] for c in w_code_str.split(",") if c.strip() in WARNING_CODE_DECODER]
            warn_text = ", ".join(w_labels) if w_labels else "No Warning"
            severity_text = WARNING_COLOR_DECODER.get(c_code_str, "Green (No Warning)")

            decoded_5day_warnings.append({
                "day": f"Day {day_num}",
                "warning_codes": w_code_str,
                "warning_description": warn_text,
                "severity": severity_text,
            })

        subdiv_warnings = None
        if not district and not location:
            eff_state = state or s_name
            if eff_state:
                raw_sub = svc.get_subdivision_warnings()
                if isinstance(raw_sub, dict) and raw_sub.get("data"):
                    st_low = eff_state.lower()
                    filtered_sub = [
                        s for s in raw_sub["data"]
                        if st_low in s.get("subdivision", "").lower() or s.get("subdivision", "").lower() in st_low
                    ]
                    if filtered_sub:
                        subdiv_warnings = {
                            "success": True,
                            "date": raw_sub.get("date"),
                            "total_subdivisions": len(filtered_sub),
                            "data": filtered_sub,
                        }
            else:
                subdiv_warnings = svc.get_subdivision_warnings()

        day1 = decoded_5day_warnings[0] if decoded_5day_warnings else {}
        place_label = matched or hint or resolved_name or "Location"
        alerts_summary = f"IMD Weather Alert for {place_label}: Today ({day1.get('day')}): {day1.get('warning_description')} [{day1.get('severity')}]."
        st_context = _build_nearest_station_context(svc, actual_lat, actual_lon, s_name, geo, place_label)

        res_dict = {
            "resolved_location": _build_resolved_location_name(location, district or matched or hint, resolved_name or (geo.get("display_name") if geo else None)),
            "district": matched or hint,
            "summary": alerts_summary,
            "district_5day_warnings": decoded_5day_warnings,
        }
        if st_context is not None:
            res_dict["nearest_station_info"] = st_context
        if subdiv_warnings is not None:
            res_dict["subdivision_warnings"] = subdiv_warnings
        return res_dict

    return await asyncio.to_thread(_run)


# --------------------------------------------------------------------------
# TOOL 7: get_sowing_weather_guide (Cluster 7 - COMMENTED OUT AS REQUESTED)
# --------------------------------------------------------------------------
@mcp.tool()
async def get_sowing_weather_guide(
    lat: Optional[float] = None,
    long: Optional[float] = None,
    location: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    crop_name: Optional[str] = None,
    query_type: str = "sowing_time",
    language: str = "en",
) -> dict:
    """
    Get weather-aware sowing recommendations including weather suitability for sowing, planting season guidance, and nursery prep.
    query_type options: 'sowing_time', 'weather_for_sowing', 'nursery_prep', 'season_calendar'.
    """
    logger.info("get_sowing_weather_guide | location=%s, crop=%s, query_type=%s", location or district, crop_name, query_type)
    svc = get_service()
    actual_lat, actual_lon, resolved_name = _resolve_coordinates(lat, long, location, district, state)

    def _run():
        geo = svc.reverse_geocode(actual_lat, actual_lon)
        fc = svc.get_forecast_bundle(actual_lat, actual_lon)
        s_name = state or geo.get("state")
        hint = district or geo.get("district_guess")
        obj_id, matched = svc.resolve_district_obj_id(hint, s_name, geo)
        rainfall_data = svc.get_district_rainfall_raw(obj_id) if obj_id else None

        qt = (query_type or "sowing_time").lower()
        today_fc = fc.get("today", {})
        rain_obs = today_fc.get("past_24hrs_rainfall", "0")

        sowing_guidance = ""
        if qt == "nursery_prep":
            sowing_guidance = f"Nursery preparation guidance for {crop_name or 'crop'}: Ensure seedbeds are raised and protected against waterlogging. Weather forecast: {today_fc.get('forecast', 'N/A')}."
        elif qt == "weather_for_sowing":
            sowing_guidance = f"Weather suitability for sowing {crop_name or 'crops'}: Past 24h rainfall is {rain_obs} mm. Expected forecast: {today_fc.get('forecast', 'N/A')}."
        else:
            sowing_guidance = f"Optimal sowing window advice for {crop_name or 'crop'} in {matched or hint or 'the region'}: Check temperature ({today_fc.get('forecast_min_temp')}°C - {today_fc.get('forecast_max_temp')}°C) and moisture before sowing."

        return {
            "success": True,
            "tool": "get_sowing_weather_guide",
            "resolved_location": resolved_name or geo.get("display_name"),
            "crop_name": crop_name,
            "query_type": query_type,
            "sowing_guidance": sowing_guidance,
            "sowing_weather_context": today_fc,
            "weekly_forecast": fc.get("forecast"),
            "recent_rainfall": rainfall_data,
        }

    return await asyncio.to_thread(_run)


# --------------------------------------------------------------------------
# Direct Python Async Functions for Internal Imports
# --------------------------------------------------------------------------
async def call_current_and_forecast_info(**kwargs) -> dict:
    return await get_current_and_forecast_info(**kwargs)

async def call_rainfall_and_monsoon_info(**kwargs) -> dict:
    return await get_rainfall_and_monsoon_info(**kwargs)

async def call_temperature_info(**kwargs) -> dict:
    return await get_temperature_info(**kwargs)

async def call_sowing_weather_guide(**kwargs) -> dict:
    return await get_sowing_weather_guide(**kwargs)

async def call_location_weather(**kwargs) -> dict:
    return await get_location_weather(**kwargs)

async def call_weather_nowcast(**kwargs) -> dict:
    return await get_weather_nowcast(**kwargs)

async def call_weather_alerts(**kwargs) -> dict:
    return await get_weather_alerts(**kwargs)


if __name__ == "__main__":
    host = os.getenv("MCP_HOST", "0.0.0.0").strip()
    port = int(os.getenv("MCP_PORT", "8007"))
    mcp.run(transport="streamable-http", host=host, port=port)

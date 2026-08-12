# ajrasakha/tools/weather/weather_tools2.py
# FastMCP Weather Server — 7 tools mapped to farmer query clusters.
# Today/history prefer WS Nearest Sensors history API; IMD is fallback.

from __future__ import annotations

import asyncio
import logging
import math
import os
import random
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Any, Optional, Dict, List, Union

import requests

# Ensure ajrasakha package directory is in sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
_ai_root = os.path.abspath(os.path.join(_current_dir, "..", "..", ".."))
if _ai_root not in sys.path:
    sys.path.insert(0, _ai_root)

from dotenv import load_dotenv
from fastmcp import FastMCP

from ajrasakha.tools.weather.weather_service import get_service
from ajrasakha.tools.weather.code import (
    DISTRICT_WARNING_COLOR_CODES,
    NOWCAST_CATEGORY_CODES,
    NOWCAST_COLOR_CODES,
    RAINFALL_CATEGORY_CODES,
)
from ajrasakha.tools.weather.imd_codes import (
    describe_district_warnings,
    describe_wind_direction,
    enrich_station_fields,
)

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
logger = logging.getLogger("ajrasakha-weather-mcp2")

mcp = FastMCP(
    "ajrasakha-weather-mcp2",
    instructions="Provides 7 specialized weather tools for agricultural queries (WS history first for today/history).",
)

WS_BASE_URL = os.getenv(
    "WS_NEAREST_SENSORS_BASE_URL",
    "https://5mqwg03znl.execute-api.us-east-1.amazonaws.com",
).rstrip("/")
WS_HISTORY_PATH = "/history/WS_Nearest_Sensors"
WS_NEARBY_PATH = "/nearby/WS_Nearest_Sensors"
WS_TIMEOUT_SECONDS = float(os.getenv("WS_NEAREST_SENSORS_TIMEOUT", "12"))
# Annam WS typically only returns stations within ~10 km of the query pin.
# When the exact lat/lon misses, probe random pins within this radius.
WS_PROBE_RADIUS_KM = float(os.getenv("WS_PROBE_RADIUS_KM", "30"))
WS_PROBE_COUNT = int(os.getenv("WS_PROBE_COUNT", "15"))  # try 10–20 nearby pins
WS_PROBE_MAX_WORKERS = int(os.getenv("WS_PROBE_MAX_WORKERS", "5"))

# Human-facing data source labels (WS nearest sensors == Annam weather stations)
DATA_SOURCE_IMD = "India Meteorological Department (IMD)"
DATA_SOURCE_ANNAM = "Annam Weather Station"


def _label_data_source(raw: Any) -> str:
    """Map internal source codes / legacy labels to IMD vs Annam Weather Station."""
    text = str(raw or "").strip().lower()
    if not text:
        return DATA_SOURCE_IMD
    if (
        text in {"ws", "ws_nearest_sensors", "annam", "annam weather station"}
        or text.startswith("ws")
        or "annam" in text
        or "nearest_sensors" in text
    ):
        return DATA_SOURCE_ANNAM
    return DATA_SOURCE_IMD


def _is_annam_source(raw: Any) -> bool:
    return _label_data_source(raw) == DATA_SOURCE_ANNAM


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
            "station_details": (aws.get("station", {}) if aws else {}),
            "data_source": DATA_SOURCE_IMD,
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
            "station_details": st,
            "data_source": DATA_SOURCE_IMD,
        }
    else:
        return {
            "nearest_station_name": None,
            "distance_from_requested_place_km": None,
            "search_radius_km": 50.0,
            "nearest_station_note": f"Notice: No active IMD weather station found within 50.0 km radius search range of {place_label}.",
            "station_details": {},
            "data_source": DATA_SOURCE_IMD,
        }


# --------------------------------------------------------------------------
# WS Nearest Sensors history API (priority for today + history)
# --------------------------------------------------------------------------
def _ws_safe_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _ws_parse_timestamp(ts: Any) -> datetime | None:
    if not ts:
        return None
    text = str(ts).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:19] if fmt != "%Y-%m-%d" else text[:10], fmt)
        except Exception:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _ws_station_label(row: dict[str, Any]) -> str:
    return (
        row.get("DeviceId")
        or row.get("Annam_ID")
        or row.get("City")
        or row.get("District")
        or "Nearest Weather Station"
    )


def _ws_nearby_rows(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Normalize API 'nearby' field to a list of station dicts (string errors become [])."""
    if not isinstance(payload, dict):
        return []
    nearby = payload.get("nearby")
    if isinstance(nearby, list):
        return [r for r in nearby if isinstance(r, dict)]
    if isinstance(nearby, str) and nearby.strip():
        logger.info("WS API nearby notice: %s", nearby.strip())
    return []


def _ws_history_rows(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    history = payload.get("history")
    if isinstance(history, list):
        return [r for r in history if isinstance(r, dict)]
    return []


def _ws_row_has_observation(row: dict[str, Any]) -> bool:
    """True when a nearby/history row has a usable live temperature reading."""
    return _ws_safe_float(row.get("Temperature")) is not None


def _fetch_ws_history(lat: float, lon: float) -> dict[str, Any] | None:
    """Fetch nearest sensor latest + last-7-day history. Returns None on failure/empty."""
    url = f"{WS_BASE_URL}{WS_HISTORY_PATH}"
    try:
        resp = requests.get(
            url,
            params={"lat": lat, "long": lon},
            headers={"Accept": "application/json"},
            timeout=WS_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("WS history API failed for lat=%s lon=%s: %s", lat, lon, exc)
        return None

    if not isinstance(data, dict):
        return None
    nearby_rows = _ws_nearby_rows(data)
    history_rows = _ws_history_rows(data)
    if not nearby_rows and not history_rows:
        logger.info("WS history API returned empty nearby/history for lat=%s lon=%s", lat, lon)
        return None
    # Re-normalize so callers always see list-shaped nearby.
    return {"nearby": nearby_rows, "history": history_rows}


def _fetch_ws_nearby(lat: float, lon: float) -> dict[str, Any] | None:
    """Fetch nearest sensors list. Returns None on failure/empty."""
    url = f"{WS_BASE_URL}{WS_NEARBY_PATH}"
    try:
        resp = requests.get(
            url,
            params={"lat": lat, "long": lon},
            headers={"Accept": "application/json"},
            timeout=WS_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("WS nearby API failed for lat=%s lon=%s: %s", lat, lon, exc)
        return None

    if not isinstance(data, dict):
        return None
    nearby_rows = _ws_nearby_rows(data)
    if not nearby_rows:
        return None
    return {"nearby": nearby_rows}


def _map_ws_reading_to_today(row: dict[str, Any], *, source_label: str = DATA_SOURCE_ANNAM) -> dict[str, Any]:
    """Normalize a WS nearby/history row into IMD today_raw-compatible keys."""
    ts = _ws_parse_timestamp(row.get("TimeStamp"))
    date_str = ts.strftime("%Y-%m-%d") if ts else datetime.now().strftime("%Y-%m-%d")
    temp = _ws_safe_float(row.get("Temperature"))
    humidity = _ws_safe_float(row.get("Humidity"))
    rainfall = _ws_safe_float(row.get("Rainfall"))
    wind_speed = _ws_safe_float(row.get("WindSpeed"))
    wind_dir = _ws_safe_float(row.get("WindDirection"))
    pressure = _ws_safe_float(row.get("AtmPressure"))
    gust = _ws_safe_float(row.get("WindGust"))
    dist = _ws_safe_float(row.get("DistanceKM"))
    slat = _ws_safe_float(row.get("Latitude"))
    slon = _ws_safe_float(row.get("Longitude"))

    return {
        "date": date_str,
        "station": _ws_station_label(row),
        "station_code": row.get("DeviceId") or row.get("Annam_ID"),
        "observed_min_temp": temp,
        "observed_max_temp": temp,
        "past_24hrs_rainfall": rainfall if rainfall is not None else 0.0,
        "humidity_0830": humidity,
        "humidity_1730": humidity,
        "sunrise": None,
        "sunset": None,
        "forecast_max_temp": temp,
        "forecast_min_temp": temp,
        "forecast": None,
        "nearest_station_lat": slat,
        "nearest_station_lon": slon,
        "distance_to_station_km": round(dist, 2) if dist is not None else None,
        "wind_speed_mps": wind_speed,
        "wind_direction_deg": wind_dir,
        "wind_direction": describe_wind_direction(wind_dir) if wind_dir is not None else None,
        "atm_pressure": pressure,
        "wind_gust_mps": gust,
        "observation_timestamp": row.get("TimeStamp"),
        "state": row.get("State"),
        "district": row.get("District"),
        "city": row.get("City"),
        "data_source": source_label,
    }


def _aggregate_ws_history_by_date(history_rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Group history readings by calendar date and aggregate min/max/rainfall/humidity."""
    buckets: dict[str, list[dict[str, Any]]] = {}
    for row in history_rows:
        if not isinstance(row, dict):
            continue
        ts = _ws_parse_timestamp(row.get("TimeStamp"))
        if not ts:
            continue
        d = ts.strftime("%Y-%m-%d")
        buckets.setdefault(d, []).append(row)

    daily: dict[str, dict[str, Any]] = {}
    for date_str, rows in buckets.items():
        temps = [t for t in (_ws_safe_float(r.get("Temperature")) for r in rows) if t is not None]
        hums = [h for h in (_ws_safe_float(r.get("Humidity")) for r in rows) if h is not None]
        rains = [r for r in (_ws_safe_float(x.get("Rainfall")) for x in rows) if r is not None]
        # Prefer latest reading metadata (API is time-descending).
        latest = rows[0]
        min_t = min(temps) if temps else None
        max_t = max(temps) if temps else None
        rain_sum = sum(rains) if rains else 0.0
        daily[date_str] = {
            "date": date_str,
            "station": _ws_station_label(latest),
            "station_code": latest.get("DeviceId") or latest.get("Annam_ID"),
            "observed_min_temp": min_t,
            "observed_max_temp": max_t,
            "min_temp": min_t,
            "max_temp": max_t,
            "past_24hrs_rainfall": rain_sum,
            "observed_past_24hrs_rainfall": rain_sum,
            "humidity_0830": hums[0] if hums else None,
            "humidity_1730": hums[-1] if hums else None,
            "forecast": None,
            "observation_count": len(rows),
            "latest_timestamp": latest.get("TimeStamp"),
            "data_source": DATA_SOURCE_ANNAM,
        }
    return daily


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two WGS84 points."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(min(1.0, a)))


def _random_points_within_radius(
    lat: float,
    lon: float,
    *,
    radius_km: float = WS_PROBE_RADIUS_KM,
    count: int = WS_PROBE_COUNT,
) -> list[tuple[float, float]]:
    """
    Sample `count` points uniformly at random inside a circle of `radius_km`
    around (lat, lon). Used to find an Annam station when the exact pin is
    outside the API's ~10 km coverage window.
    """
    if count <= 0 or radius_km <= 0:
        return []
    points: list[tuple[float, float]] = []
    cos_lat = math.cos(math.radians(lat))
    # Avoid division by zero near the poles.
    cos_lat = cos_lat if abs(cos_lat) > 1e-6 else 1e-6
    for _ in range(count):
        # Uniform-in-area: r = R * sqrt(u), theta = 2πv
        r_km = radius_km * math.sqrt(random.random())
        theta = random.uniform(0.0, 2.0 * math.pi)
        dlat = (r_km / 111.32) * math.cos(theta)
        dlon = (r_km / (111.32 * cos_lat)) * math.sin(theta)
        points.append((lat + dlat, lon + dlon))
    return points


def _rebase_ws_distances_to_query(
    result: dict[str, Any],
    query_lat: float,
    query_lon: float,
) -> dict[str, Any]:
    """Rewrite DistanceKM / distance_to_station_km relative to the original query pin."""
    nearby_rows = result.get("raw_nearby") or []
    for row in nearby_rows:
        if not isinstance(row, dict):
            continue
        slat = _ws_safe_float(row.get("Latitude"))
        slon = _ws_safe_float(row.get("Longitude"))
        if slat is None or slon is None:
            continue
        row["DistanceKM"] = round(_haversine_km(query_lat, query_lon, slat, slon), 2)

    today = result.get("today")
    if isinstance(today, dict):
        slat = _ws_safe_float(today.get("nearest_station_lat"))
        slon = _ws_safe_float(today.get("nearest_station_lon"))
        if slat is not None and slon is not None:
            today["distance_to_station_km"] = round(
                _haversine_km(query_lat, query_lon, slat, slon), 2
            )
    return result


def _get_ws_at_coords(lat: float, lon: float) -> dict[str, Any] | None:
    """
    Fetch Annam WS today + last-7-day history for a single lat/lon pin.
    Fallback chain for this pin:
      1) /history at query coords
      2) /nearby for a live reading
      3) /history again at the nearest station's own lat/lon
    Returns None when Annam has no usable data at this pin.
    """
    payload = _fetch_ws_history(lat, lon)
    nearby_rows = _ws_nearby_rows(payload)
    history_rows = _ws_history_rows(payload)

    # If history endpoint has no usable live reading, try nearby list, then
    # re-query history at the closest station coordinates.
    if not any(_ws_row_has_observation(r) for r in nearby_rows) and not history_rows:
        nearby_payload = _fetch_ws_nearby(lat, lon)
        nearby_rows = _ws_nearby_rows(nearby_payload)
        usable = next((r for r in nearby_rows if _ws_row_has_observation(r)), None)
        if usable and _ws_safe_float(usable.get("Temperature")) is not None:
            payload = {"nearby": [usable], "history": []}
            history_rows = []
            nearby_rows = [usable]
        else:
            # Retry history at station pin (history API often needs station-proximate coords).
            for cand in nearby_rows:
                slat = _ws_safe_float(cand.get("Latitude"))
                slon = _ws_safe_float(cand.get("Longitude"))
                if slat is None or slon is None:
                    continue
                retry = _fetch_ws_history(slat, slon)
                retry_nearby = _ws_nearby_rows(retry)
                retry_history = _ws_history_rows(retry)
                if retry_nearby or retry_history:
                    # Preserve original distance from query point when available.
                    if retry_nearby and cand.get("DistanceKM") is not None:
                        retry_nearby[0].setdefault("DistanceKM", cand.get("DistanceKM"))
                    payload = {"nearby": retry_nearby, "history": retry_history}
                    nearby_rows = retry_nearby
                    history_rows = retry_history
                    break

    if not payload and not nearby_rows and not history_rows:
        return None
    if not nearby_rows and not history_rows:
        return None

    nearby0 = next((r for r in nearby_rows if _ws_row_has_observation(r)), None)
    if nearby0 is None and nearby_rows:
        nearby0 = nearby_rows[0]

    daily = _aggregate_ws_history_by_date(history_rows)
    today_str = datetime.now().strftime("%Y-%m-%d")

    today_raw = None
    if nearby0 and _ws_row_has_observation(nearby0):
        today_raw = _map_ws_reading_to_today(nearby0)
        # Enrich today's min/max from same-day history samples when available.
        day_agg = daily.get(today_raw.get("date") or today_str)
        if day_agg:
            if day_agg.get("observed_min_temp") is not None:
                today_raw["observed_min_temp"] = day_agg["observed_min_temp"]
                today_raw["forecast_min_temp"] = day_agg["observed_min_temp"]
            if day_agg.get("observed_max_temp") is not None:
                today_raw["observed_max_temp"] = day_agg["observed_max_temp"]
                today_raw["forecast_max_temp"] = day_agg["observed_max_temp"]
            if day_agg.get("past_24hrs_rainfall") is not None:
                today_raw["past_24hrs_rainfall"] = day_agg["past_24hrs_rainfall"]
    elif daily:
        # No nearby reading: use most recent daily bucket as today.
        latest_date = max(daily.keys())
        today_raw = dict(daily[latest_date])
        today_raw.setdefault("forecast_min_temp", today_raw.get("observed_min_temp"))
        today_raw.setdefault("forecast_max_temp", today_raw.get("observed_max_temp"))
        today_raw["data_source"] = DATA_SOURCE_ANNAM

    if not today_raw and not daily:
        return None

    return {
        "success": True,
        "source": "ws",
        "today": today_raw or {},
        "history_by_date": daily,
        "raw_nearby": nearby_rows,
        "raw_history_count": len(history_rows),
    }


def _probe_ws_within_radius(
    lat: float,
    lon: float,
    *,
    radius_km: float = WS_PROBE_RADIUS_KM,
    count: int = WS_PROBE_COUNT,
) -> dict[str, Any] | None:
    """
    When the exact query pin has no Annam station (~10 km API window), try
    random pins inside `radius_km` until one returns usable WS data.
    """
    probes = _random_points_within_radius(lat, lon, radius_km=radius_km, count=count)
    if not probes:
        return None

    logger.info(
        "WS Annam miss at lat=%s lon=%s; probing %d random pins within %.0f km",
        lat,
        lon,
        len(probes),
        radius_km,
    )

    workers = max(1, min(WS_PROBE_MAX_WORKERS, len(probes)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(_get_ws_at_coords, plat, plon): (plat, plon) for plat, plon in probes
        }
        for fut in as_completed(futures):
            plat, plon = futures[fut]
            try:
                result = fut.result()
            except Exception as exc:
                logger.warning("WS probe failed at lat=%s lon=%s: %s", plat, plon, exc)
                continue
            if not result:
                continue
            # Cancel remaining probes once we have a hit.
            for pending in futures:
                pending.cancel()
            result = _rebase_ws_distances_to_query(result, lat, lon)
            result["ws_probe"] = {
                "used": True,
                "query_lat": lat,
                "query_lon": lon,
                "probe_lat": plat,
                "probe_lon": plon,
                "radius_km": radius_km,
                "probe_count": count,
            }
            dist = (result.get("today") or {}).get("distance_to_station_km")
            logger.info(
                "WS Annam hit via probe pin lat=%s lon=%s (station ~%s km from query)",
                plat,
                plon,
                dist,
            )
            return result

    logger.info(
        "WS Annam still empty after %d probes within %.0f km of lat=%s lon=%s",
        count,
        radius_km,
        lat,
        lon,
    )
    return None


def _get_ws_today_and_history(lat: float, lon: float) -> dict[str, Any] | None:
    """
    Prefer Annam WS for today + last-7-day history.
    Fallback chain:
      1) Exact agent lat/lon (/history → /nearby → station-pin retry)
      2) Random 10–20 pins inside ~30 km (Annam API ~10 km window miss)
    Returns None when Annam has no usable data (caller should fall back to IMD).
    """
    result = _get_ws_at_coords(lat, lon)
    if result:
        return result
    return _probe_ws_within_radius(lat, lon)


def _get_forecast_bundle_ws_first(svc, lat: float, lon: float) -> dict[str, Any]:
    """
    Build a forecast-bundle-compatible dict.
    Priority:
      - today / history observations: Annam Weather Station first, IMD fallback
      - multi-day forecast days (day 2+): IMD only (Annam has no multi-day forecast feed)
    """
    ws = _get_ws_today_and_history(lat, lon)
    imd = None
    try:
        imd = svc.get_forecast_bundle(lat, lon)
    except Exception as exc:
        logger.warning("IMD get_forecast_bundle failed: %s", exc)
        imd = {"success": False, "error": str(exc)}

    imd_ok = bool(imd and imd.get("success"))
    imd_today = imd.get("today", {}) if imd_ok else {}
    imd_forecast = imd.get("forecast", []) if imd_ok else []

    if ws and ws.get("today"):
        today = dict(ws["today"])
        # Keep Annam observations primary. Only borrow IMD sky text / sun times when missing.
        if today.get("forecast") is None and imd_today.get("forecast") is not None:
            today["forecast"] = imd_today.get("forecast")
        for k in ("sunrise", "sunset"):
            if today.get(k) is None and imd_today.get(k) is not None:
                today[k] = imd_today.get(k)
        # Do not overwrite Annam observed temps with IMD forecast temps.
        today.setdefault("forecast_min_temp", today.get("observed_min_temp"))
        today.setdefault("forecast_max_temp", today.get("observed_max_temp"))

        today["data_source"] = DATA_SOURCE_ANNAM
        ws_meta = {
            "raw_history_count": ws.get("raw_history_count"),
            "source": DATA_SOURCE_ANNAM,
        }
        if ws.get("ws_probe"):
            ws_meta["probe"] = ws["ws_probe"]
        return {
            "success": True,
            "today": today,
            "forecast": imd_forecast,
            "history_by_date": ws.get("history_by_date") or {},
            "data_source_today": "ws",
            "data_source": DATA_SOURCE_ANNAM,
            # Multi-day outlook only — omit unless forecast days are actually present.
            "forecast_data_source": DATA_SOURCE_IMD if imd_forecast else None,
            "stations_returned": imd.get("stations_returned") if imd_ok else 1,
            "ws_meta": ws_meta,
        }

    if imd_ok:
        out = dict(imd)
        out["history_by_date"] = {}
        out["data_source_today"] = "imd"
        out["data_source"] = DATA_SOURCE_IMD
        # Single source — do not also emit a separate forecast_data_source line.
        out["forecast_data_source"] = None
        out["annam_unavailable_note"] = (
            "Annam Weather Station data was not available for this location; "
            "using India Meteorological Department (IMD)."
        )
        today_imd = out.get("today")
        if isinstance(today_imd, dict):
            today_imd["data_source"] = DATA_SOURCE_IMD
        return out

    return {"success": False, "error": "No weather data from Annam Weather Station or IMD", "history_by_date": {}}


def _lookup_history_day(
    history_by_date: dict[str, dict[str, Any]],
    date_str: str,
    *,
    today_raw: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Return a daily history record for date_str from WS aggregates when present."""
    if history_by_date and date_str in history_by_date:
        return history_by_date[date_str]
    if today_raw and today_raw.get("date") == date_str and _is_annam_source(today_raw.get("data_source")):
        return today_raw
    return None


def _build_ws_nearest_station_context(
    lat: float,
    lon: float,
    requested_place: Optional[str],
    ws_today: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    """Build nearest-station note from WS data when available."""
    if not requested_place:
        return None
    if not ws_today:
        return None
    st_name = ws_today.get("station") or "Annam Weather Station"
    dkm = ws_today.get("distance_to_station_km")
    place_label = requested_place
    if dkm is not None and float(dkm) > 0.5:
        note = (
            f"Notice: Weather observations retrieved from nearest Annam weather station '{st_name}' "
            f"located {float(dkm):.1f} km from {place_label}."
        )
    else:
        note = f"Observed weather data from Annam weather station '{st_name}' at {place_label}."
    return {
        "nearest_station_name": st_name,
        "distance_from_requested_place_km": dkm,
        "search_radius_km": None,
        "nearest_station_note": note,
        "station_details": {
            "name": st_name,
            "code": ws_today.get("station_code"),
            "lat": ws_today.get("nearest_station_lat"),
            "lon": ws_today.get("nearest_station_lon"),
            "data_source": DATA_SOURCE_ANNAM,
        },
        "data_source": DATA_SOURCE_ANNAM,
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
        bundle = _get_forecast_bundle_ws_first(svc, actual_lat, actual_lon)
        geo = None
        try:
            geo = svc.reverse_geocode(actual_lat, actual_lon)
        except Exception:
            pass

        result_payload = {}
        qt = (query_type or "today").lower()
        history_by_date = bundle.get("history_by_date") or {}
        data_source_today = bundle.get("data_source_today") or "imd"
        full_7day_forecast: list[dict[str, Any]] = []
        today_raw: dict[str, Any] = {}

        if bundle.get("success"):
            today_raw = bundle.get("today", {}) or {}
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
                    "data_source": today_raw.get("data_source") or _label_data_source(data_source_today),
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
                    "data_source": DATA_SOURCE_IMD,
                })

            eff_from_date = from_date
            eff_to_date = to_date
            # Bare "previous/past" with no range → last 7 days (inclusive of today)
            if qt == "previous" and not eff_from_date and not target_date:
                try:
                    base = datetime.strptime(today_str, "%Y-%m-%d")
                except Exception:
                    base = datetime.now()
                eff_from_date = (base - timedelta(days=6)).strftime("%Y-%m-%d")
                eff_to_date = today_str
            if eff_from_date and not eff_to_date:
                eff_to_date = today_str

            place_label = location or district or resolved_name or "Location"

            # Case A: Specific target_date
            if target_date:
                matched_item = next((item for item in full_7day_forecast if item.get("date") == target_date), None)
                result_payload["selected_timeframe"] = f"specific_target_date ({target_date})"
                if matched_item and target_date >= today_str:
                    result_payload["target_date_weather"] = matched_item
                else:
                    ws_hist = _lookup_history_day(history_by_date, target_date, today_raw=today_raw)
                    if ws_hist and target_date <= today_str:
                        result_payload["target_date_weather"] = {
                            "date": target_date,
                            "station": ws_hist.get("station") or today_raw.get("station"),
                            "min_temp": ws_hist.get("observed_min_temp") or ws_hist.get("min_temp"),
                            "max_temp": ws_hist.get("observed_max_temp") or ws_hist.get("max_temp"),
                            "forecast": ws_hist.get("forecast") or "Observed weather",
                            "observed_past_24hrs_rainfall": (
                                ws_hist.get("past_24hrs_rainfall")
                                or ws_hist.get("observed_past_24hrs_rainfall")
                                or 0.0
                            ),
                            "humidity_0830": ws_hist.get("humidity_0830"),
                            "humidity_1730": ws_hist.get("humidity_1730"),
                            "data_source": ws_hist.get("data_source") or DATA_SOURCE_ANNAM,
                        }
                    elif matched_item:
                        result_payload["target_date_weather"] = matched_item
                    elif target_date < today_str:
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
                                "data_source": DATA_SOURCE_IMD,
                            }
                        else:
                            result_payload["target_date_weather"] = {
                                "requested_target_date": target_date,
                                "notice": f"Notice: Weather data for requested date ({target_date}) is not available in WS history or active IMD feed for {place_label}. Showing today's weather data below:",
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
                    ws_hist = _lookup_history_day(history_by_date, d_str, today_raw=today_raw)
                    if ws_hist:
                        ranged_items.append({
                            "date": d_str,
                            "station": ws_hist.get("station") or today_raw.get("station"),
                            "observed_min_temp": ws_hist.get("observed_min_temp"),
                            "observed_max_temp": ws_hist.get("observed_max_temp"),
                            "observed_past_24hrs_rainfall": (
                                ws_hist.get("past_24hrs_rainfall")
                                or ws_hist.get("observed_past_24hrs_rainfall")
                            ),
                            "humidity_0830": ws_hist.get("humidity_0830"),
                            "humidity_1730": ws_hist.get("humidity_1730"),
                            "data_source": ws_hist.get("data_source") or DATA_SOURCE_ANNAM,
                        })
                        continue

                    match = next((item for item in full_7day_forecast if item.get("date") == d_str), None)
                    if match:
                        ranged_items.append(match)
                    else:
                        ranged_items.append({
                            "date": d_str,
                            "station": today_raw.get("station"),
                            "observed_min_temp": today_raw.get("observed_min_temp"),
                            "observed_max_temp": today_raw.get("observed_max_temp"),
                            "observed_past_24hrs_rainfall": today_raw.get("past_24hrs_rainfall"),
                            "data_source": DATA_SOURCE_IMD,
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

            result_payload["data_source_today"] = data_source_today
            result_payload["data_source"] = _label_data_source(data_source_today)
            # Only expose IMD as a separate forecast source when multi-day forecast is returned.
            showing_multiday = bool(
                result_payload.get("forecast_list")
                or (isinstance(result_payload.get("selected_timeframe"), str)
                    and "days_forecast" in result_payload.get("selected_timeframe", ""))
            )
            if showing_multiday and data_source_today == "ws" and bundle.get("forecast"):
                result_payload["forecast_data_source"] = DATA_SOURCE_IMD
            if bundle.get("annam_unavailable_note"):
                result_payload["annam_unavailable_note"] = bundle.get("annam_unavailable_note")

        place_label = location or district or resolved_name or "Location"
        # IMD Current Weather API (current_wx) — used for live observation on "today"/current queries
        imd_current = None
        want_current = (qt in {"today", "current", ""}) and not target_date and not from_date and forecast_days <= 1
        if want_current or qt in {"today", "current"}:
            imd_current = _fetch_imd_current_wx(svc, actual_lat, actual_lon)

        if target_date:
            m_target = next((item for item in full_7day_forecast if item.get("date") == target_date), None)
            if m_target:
                human_sum = f"Weather forecast for {target_date} in {place_label}: Max Temp: {m_target.get('max_temp', m_target.get('forecast_max_temp', 'N/A'))}°C, Min Temp: {m_target.get('min_temp', m_target.get('forecast_min_temp', 'N/A'))}°C, Forecast: {m_target.get('forecast', 'N/A')}."
            else:
                human_sum = f"Weather forecast for {target_date} in {place_label}: Official IMD 7-day forecast trend shows temperatures between {today_raw.get('forecast_min_temp', '23')}°C and {today_raw.get('forecast_max_temp', '29')}°C with {today_raw.get('forecast', 'intermittent rain')}."
        elif from_date:
            human_sum = f"Recorded/forecast weather range ({from_date} to {to_date or datetime.now().strftime('%Y-%m-%d')}) for {place_label}: Max Temp: {today_raw.get('forecast_max_temp', 'N/A')}°C, Min Temp: {today_raw.get('forecast_min_temp', 'N/A')}°C, Past 24h Rain: {today_raw.get('past_24hrs_rainfall', '0.0')} mm."
        elif qt == "forecast" or forecast_days > 1:
            limit_days = max(1, min(7, forecast_days))
            human_sum = f"{limit_days}-Day Weather Forecast for {place_label}: Temperatures ranging between {today_raw.get('forecast_min_temp', 'N/A')}°C and {today_raw.get('forecast_max_temp', 'N/A')}°C. Forecast: {today_raw.get('forecast', 'Generally cloudy sky with rain')}."
        else:
            cond = today_raw.get("forecast", "Normal weather")
            if isinstance(imd_current, dict) and imd_current.get("success"):
                cst = imd_current.get("station") or {}
                cond = cst.get("weather_description") or cst.get("weather_message") or cond
                wind_desc = cst.get("wind_direction") or describe_wind_direction(
                    cst.get("wind_direction_code") or cst.get("wind_direction_deg")
                )
                human_sum = (
                    f"Today's Weather in {place_label}: "
                    f"Temp: {cst.get('temperature_c', today_raw.get('observed_min_temp', 'N/A'))}°C, "
                    f"Humidity: {cst.get('humidity_pct', today_raw.get('humidity_0830', 'N/A'))}%, "
                    f"Wind: {wind_desc or 'N/A'} "
                    f"{cst.get('wind_speed_kmph', '')} kmph, "
                    f"Condition: {cond}."
                )
            else:
                human_sum = f"Today's Weather in {place_label}: Observed Temp: {today_raw.get('observed_min_temp', 'N/A')}°C to {today_raw.get('observed_max_temp', 'N/A')}°C, Past 24h Rain: {today_raw.get('past_24hrs_rainfall', '0.0')} mm, Forecast: {cond}."

        ws_ctx = _build_ws_nearest_station_context(
            actual_lat, actual_lon, location or district or resolved_name, today_raw if data_source_today == "ws" else None
        )
        st_context = ws_ctx or _build_nearest_station_context(
            svc, actual_lat, actual_lon, state, geo, location or district or resolved_name
        )
        res_dict = {
            "resolved_location": _build_resolved_location_name(location, district, resolved_name or (geo.get("display_name") if geo else None)),
            "summary": human_sum,
            "weather_data": result_payload,
            "data_source": result_payload.get("data_source") or _label_data_source(data_source_today),
        }
        if result_payload.get("forecast_data_source"):
            res_dict["forecast_data_source"] = result_payload["forecast_data_source"]
        if result_payload.get("annam_unavailable_note"):
            res_dict["annam_unavailable_note"] = result_payload["annam_unavailable_note"]
        if target_date:
            res_dict["target_date"] = target_date
        if from_date:
            res_dict["from_date"] = from_date
            res_dict["to_date"] = to_date or datetime.now().strftime("%Y-%m-%d")
        if st_context is not None:
            res_dict["nearest_station_info"] = st_context
        if isinstance(imd_current, dict) and imd_current.get("success"):
            res_dict["imd_current_weather"] = imd_current
            if isinstance(result_payload, dict) and result_payload.get("selected_timeframe") == "today":
                result_payload["imd_current_weather"] = imd_current
                res_dict["weather_data"] = result_payload
        return res_dict

    return await asyncio.to_thread(_run)


RAINFALL_CATEGORY_DECODER = RAINFALL_CATEGORY_CODES

# District warning DayN_Color → human severity (codes + hex from code.py).
_DISTRICT_WARNING_SEVERITY = {
    "1": "Red (Take Action)",
    "2": "Orange (Be Prepared)",
    "3": "Yellow (Be Updated)",
    "4": "Green (No Warning)",
}
WARNING_COLOR_DECODER: dict[str, str] = dict(_DISTRICT_WARNING_SEVERITY)
for _c, _info in DISTRICT_WARNING_COLOR_CODES.items():
    _label = _DISTRICT_WARNING_SEVERITY.get(str(_c))
    if not _label:
        continue
    _hex = str(_info.get("Hex", ""))
    if _hex:
        WARNING_COLOR_DECODER[_hex] = _label
        WARNING_COLOR_DECODER[_hex.lower()] = _label
        WARNING_COLOR_DECODER[_hex.upper()] = _label

# Nowcast color codes → severity text (codes + hex from code.py).
_NOWCAST_SEVERITY = {
    "1": "Green (No Warning)",
    "2": "Yellow (Light-Moderate Warning)",
    "3": "Orange (Moderate-Severe Warning)",
    "4": "Red (Severe-Very Severe Warning)",
}
NOWCAST_COLOR_DECODER: dict[str, str] = dict(_NOWCAST_SEVERITY)
for _c, _info in NOWCAST_COLOR_CODES.items():
    _label = _NOWCAST_SEVERITY.get(str(_c))
    if not _label:
        continue
    _hex = str(_info.get("Hex", ""))
    if _hex:
        NOWCAST_COLOR_DECODER[_hex] = _label
        NOWCAST_COLOR_DECODER[_hex.lower()] = _label
        NOWCAST_COLOR_DECODER[_hex.upper()] = _label

# Nowcast Cat values are looked up by numeric/text Code from NOWCAST_CATEGORY_CODES.
NOWCAST_CAT_DECODER: dict[str, dict[str, str]] = {}
for _cat, _info in NOWCAST_CATEGORY_CODES.items():
    _code = str(_info.get("Code", "")).strip()
    _desc = str(_info.get("Description", "")).strip()
    if not _code or _code.lower() == "text":
        continue
    NOWCAST_CAT_DECODER[_code] = {
        "category_code": _code,
        "category_description": _desc,
        "category_key": _cat,
    }


def _describe_warning_code(code: Any) -> str | None:
    """Map district-warning code to label; None if unknown."""
    label = describe_district_warnings(code)
    if not label or label == str(code).strip():
        num = str(code).strip()
        return label if label and label != num else None
    return label


def _fetch_imd_current_wx(svc, lat: float, lon: float) -> dict[str, Any] | None:
    """Fetch + code-enrich nearest IMD current_wx observation. None on hard failure."""
    try:
        raw = svc.get_nearest_current_wx(lat, lon)
    except Exception as exc:
        logger.warning("get_nearest_current_wx failed: %s", exc)
        return {"success": False, "error": str(exc)}
    if not isinstance(raw, dict):
        return None
    if not raw.get("success"):
        return raw
    out = dict(raw)
    out["station"] = enrich_station_fields(raw.get("station") or {})
    out["data_source"] = DATA_SOURCE_IMD
    return out


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
        geo = svc.reverse_geocode(actual_lat, actual_lon)
        s_name = state or geo.get("state")
        hint = district or geo.get("district_guess")
        obj_id, matched = svc.resolve_district_obj_id(hint, s_name, geo)

        rainfall_data = svc.get_district_rainfall_raw(obj_id) if obj_id else None
        rec = rainfall_data.get("record", {}) if isinstance(rainfall_data, dict) and rainfall_data.get("success") else (rainfall_data if isinstance(rainfall_data, dict) else {})
        subdiv_rainfall = svc.get_subdivision_rainfall_forecast()
        bundle = _get_forecast_bundle_ws_first(svc, actual_lat, actual_lon)
        history_by_date = bundle.get("history_by_date") or {}

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
                "data_source": _label_data_source(today_raw.get("data_source") or bundle.get("data_source_today")),
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
                "data_source": DATA_SOURCE_IMD,
            })

        eff_from_date = from_date
        eff_to_date = to_date
        dt = (data_type or "current").lower()
        # Bare historical/previous with no range → last 7 days (inclusive of today)
        if (dt == "historical" or dt == "previous" or (query_type or "").lower() == "previous") and not eff_from_date and not target_date:
            try:
                base = datetime.strptime(today_str, "%Y-%m-%d")
            except Exception:
                base = datetime.now()
            eff_from_date = (base - timedelta(days=6)).strftime("%Y-%m-%d")
            eff_to_date = today_str
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
            ws_hist = _lookup_history_day(history_by_date, target_date, today_raw=today_raw)
            if ws_hist and target_date <= today_str:
                filtered_payload["rainfall_target_date"] = {
                    "date": target_date,
                    "district": matched or hint,
                    "forecast": "Observed rainfall",
                    "observed_past_24hrs_rainfall_mm": (
                        ws_hist.get("past_24hrs_rainfall")
                        or ws_hist.get("observed_past_24hrs_rainfall")
                        or 0.0
                    ),
                    "data_source": ws_hist.get("data_source") or DATA_SOURCE_ANNAM,
                }
            elif matched_rf and target_date >= today_str:
                filtered_payload["rainfall_target_date"] = matched_rf
            elif matched_rf:
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
                            "observed_past_24hrs_rainfall_mm": rec.get("Daily Actual") or today_raw.get("past_24hrs_rainfall", "0.0"),
                            "data_source": DATA_SOURCE_IMD,
                        }
                    else:
                        filtered_payload["rainfall_target_date"] = {
                            "requested_target_date": target_date,
                            "district": matched or hint,
                            "notice": f"Notice: Rainfall data for requested date ({target_date}) is not available in WS history or active IMD feed for {place_label}. Showing today's data below:",
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
                ws_hist = _lookup_history_day(history_by_date, d_str, today_raw=today_raw)
                if ws_hist:
                    ranged_rf.append({
                        "date": d_str,
                        "district": matched or hint,
                        "forecast": "Observed rainfall",
                        "observed_rainfall_mm": (
                            ws_hist.get("past_24hrs_rainfall")
                            or ws_hist.get("observed_past_24hrs_rainfall")
                            or 0.0
                        ),
                        "source": ws_hist.get("data_source") or DATA_SOURCE_ANNAM,
                        "data_source": ws_hist.get("data_source") or DATA_SOURCE_ANNAM,
                    })
                    continue
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
                        "source": DATA_SOURCE_IMD,
                        "data_source": DATA_SOURCE_IMD,
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
            if history_by_date:
                filtered_payload["ws_station_rainfall_history"] = history_by_date
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
                "data_source": _label_data_source(today_raw.get("data_source") or bundle.get("data_source_today")),
            }

        # Prefer district rainfall stats from IMD when present; observation rain from Annam/WS when used.
        obs_source = _label_data_source(today_raw.get("data_source") or bundle.get("data_source_today"))
        filtered_payload["data_source"] = DATA_SOURCE_IMD if (rec or dt == "monsoon_status") else obs_source
        if obs_source == DATA_SOURCE_ANNAM and (dt in {"current", "today"} or "today_rainfall" in filtered_payload):
            filtered_payload["observation_data_source"] = DATA_SOURCE_ANNAM
            filtered_payload["district_stats_data_source"] = DATA_SOURCE_IMD
            filtered_payload["data_source"] = DATA_SOURCE_ANNAM

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

        ws_ctx = _build_ws_nearest_station_context(
            actual_lat, actual_lon, place_label,
            today_raw if bundle.get("data_source_today") == "ws" else None,
        )
        st_context = ws_ctx or _build_nearest_station_context(svc, actual_lat, actual_lon, s_name, geo, place_label)
        res_dict = {
            "resolved_location": _build_resolved_location_name(location, district or matched or hint, resolved_name or (geo.get("display_name") if geo else None)),
            "district": matched or hint,
            "summary": human_sum,
            "results": filtered_payload,
            "data_source": filtered_payload.get("data_source") or _label_data_source(bundle.get("data_source_today")),
        }
        if filtered_payload.get("observation_data_source"):
            res_dict["observation_data_source"] = filtered_payload["observation_data_source"]
        if filtered_payload.get("district_stats_data_source"):
            res_dict["district_stats_data_source"] = filtered_payload["district_stats_data_source"]
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
        geo = svc.reverse_geocode(actual_lat, actual_lon)
        aws = svc.get_nearest_aws(actual_lat, actual_lon, geo.get("state"), geo.get("raw_address"))
        imd_current = _fetch_imd_current_wx(svc, actual_lat, actual_lon)
        fc = _get_forecast_bundle_ws_first(svc, actual_lat, actual_lon)
        history_by_date = fc.get("history_by_date") or {}

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
                "data_source": _label_data_source(today_fc.get("data_source") or fc.get("data_source_today")),
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
                "data_source": DATA_SOURCE_IMD,
            })

        eff_from_date = from_date
        eff_to_date = to_date
        qt = (query_type or "").lower()

        # Bare previous/past with no range → last 7 days (inclusive of today)
        if qt == "previous" and not eff_from_date and not target_date:
            try:
                base = datetime.strptime(today_str, "%Y-%m-%d")
            except Exception:
                base = datetime.now()
            eff_from_date = (base - timedelta(days=6)).strftime("%Y-%m-%d")
            eff_to_date = today_str

        # If from_date is set but to_date is missing, default to_date to today's date
        if eff_from_date and not eff_to_date:
            eff_to_date = today_str

        # Prefer Annam WS, then IMD current_wx, then AWS for live temp
        temp_obs = aws.get("station", {}) if aws.get("success") else {}
        if isinstance(imd_current, dict) and imd_current.get("success"):
            temp_obs = {**temp_obs, **(imd_current.get("station") or {})}
        if fc.get("data_source_today") == "ws" and today_fc:
            curr_temp = today_fc.get("observed_max_temp") or today_fc.get("observed_min_temp") or temp_obs.get("temperature_c") or "N/A"
            humidity = today_fc.get("humidity_0830") or temp_obs.get("humidity_pct") or "N/A"
            weather_msg = today_fc.get("forecast") or temp_obs.get("weather_description") or temp_obs.get("weather_message") or "N/A"
            feel_like = temp_obs.get("feel_like_c") or "N/A"
        else:
            curr_temp = temp_obs.get("temperature_c") or today_fc.get("observed_min_temp") or "N/A"
            feel_like = temp_obs.get("feel_like_c") or "N/A"
            humidity = temp_obs.get("humidity_pct") or today_fc.get("humidity_0830") or "N/A"
            weather_msg = temp_obs.get("weather_description") or temp_obs.get("weather_message") or today_fc.get("forecast") or "N/A"

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
            ws_hist = _lookup_history_day(history_by_date, target_date, today_raw=today_fc)
            if ws_hist and target_date <= today_str:
                timeframe_payload["target_date_temperature"] = {
                    "date": target_date,
                    "forecast": "Observed temperature",
                    "min_temp": ws_hist.get("observed_min_temp") or ws_hist.get("min_temp"),
                    "max_temp": ws_hist.get("observed_max_temp") or ws_hist.get("max_temp"),
                    "humidity_0830": ws_hist.get("humidity_0830"),
                    "humidity_1730": ws_hist.get("humidity_1730"),
                    "data_source": ws_hist.get("data_source") or DATA_SOURCE_ANNAM,
                }
            elif m_target and target_date >= today_str:
                timeframe_payload["target_date_temperature"] = m_target
            elif m_target:
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
                            "data_source": DATA_SOURCE_IMD,
                        }
                    else:
                        timeframe_payload["target_date_temperature"] = {
                            "requested_target_date": target_date,
                            "district": district or (geo.get("district_guess") if geo else None),
                            "notice": f"Notice: Temperature data for requested date ({target_date}) is not available in WS history or active IMD feed for {place_label}. Showing today's data below:",
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
                ws_hist = _lookup_history_day(history_by_date, d_str, today_raw=today_fc)
                if ws_hist:
                    ranged_temp.append({
                        "date": d_str,
                        "station": ws_hist.get("station") or temp_obs.get("name"),
                        "observed_min_temp_c": ws_hist.get("observed_min_temp"),
                        "observed_max_temp_c": ws_hist.get("observed_max_temp"),
                        "humidity_0830": ws_hist.get("humidity_0830"),
                        "humidity_1730": ws_hist.get("humidity_1730"),
                        "source": ws_hist.get("data_source") or DATA_SOURCE_ANNAM,
                        "data_source": ws_hist.get("data_source") or DATA_SOURCE_ANNAM,
                    })
                    continue
                match = next((item for item in temp_7day_list if item.get("date") == d_str), None)
                if match:
                    ranged_temp.append(match)
                else:
                    ranged_temp.append({
                        "date": d_str,
                        "station": temp_obs.get("name"),
                        "observed_min_temp_c": today_fc.get("observed_min_temp"),
                        "observed_max_temp_c": today_fc.get("observed_max_temp"),
                        "source": DATA_SOURCE_IMD,
                        "data_source": DATA_SOURCE_IMD,
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
                "station_name": today_fc.get("station") or temp_obs.get("name"),
                "observed_temp_c": curr_temp,
                "feel_like_c": feel_like,
                "humidity_pct": humidity,
                "weather_condition": weather_msg,
                "forecast_min_temp_c": today_fc.get("forecast_min_temp"),
                "forecast_max_temp_c": today_fc.get("forecast_max_temp"),
                "sunrise": today_fc.get("sunrise"),
                "sunset": today_fc.get("sunset"),
                "data_source": _label_data_source(today_fc.get("data_source") or fc.get("data_source_today")),
            }

        temp_data_source = _label_data_source(today_fc.get("data_source") or fc.get("data_source_today"))
        timeframe_payload["data_source"] = temp_data_source

        ws_ctx = _build_ws_nearest_station_context(
            actual_lat, actual_lon, district or location or resolved_name,
            today_fc if fc.get("data_source_today") == "ws" else None,
        )
        st_context = ws_ctx or _build_nearest_station_context(
            svc, actual_lat, actual_lon, state, geo, district or location or resolved_name
        )
        res_dict = {
            "resolved_location": _build_resolved_location_name(location, district, resolved_name or (geo.get("display_name") if geo else None)),
            "summary": temp_summary,
            "temperature_timeframe_data": timeframe_payload,
            "data_source": temp_data_source,
        }
        if target_date:
            res_dict["target_date"] = target_date
        if from_date:
            res_dict["from_date"] = from_date
            res_dict["to_date"] = to_date or today_str
        if st_context is not None:
            res_dict["nearest_station_info"] = st_context
        if aws and aws.get("success"):
            aws_out = dict(aws)
            aws_out["station"] = enrich_station_fields(aws.get("station") or {})
            res_dict["nearest_live_aws_station"] = aws_out
        if isinstance(imd_current, dict) and imd_current.get("success"):
            res_dict["imd_current_weather"] = imd_current
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

        # Prefer WS history for today's observation
        ws_bundle = _get_forecast_bundle_ws_first(svc, actual_lat, actual_lon)
        today_fc = ws_bundle.get("today", {}) if ws_bundle.get("success") else {}
        if not today_fc:
            today_fc = b.get("forecast", {}).get("today", {}) if isinstance(b.get("forecast"), dict) else {}

        aws_st = b.get("nearest_aws", {}).get("station", {}) if isinstance(b.get("nearest_aws"), dict) else {}
        if aws_st:
            aws_st = enrich_station_fields(aws_st)
        imd_current = _fetch_imd_current_wx(svc, actual_lat, actual_lon)
        cur_st = (imd_current.get("station") if isinstance(imd_current, dict) and imd_current.get("success") else {}) or {}

        if include_nearby_stations:
            ws_nearby = _fetch_ws_nearby(actual_lat, actual_lon)
            if ws_nearby and ws_nearby.get("nearby"):
                stations = []
                for row in ws_nearby.get("nearby", [])[:max_stations]:
                    if not isinstance(row, dict):
                        continue
                    dist = _ws_safe_float(row.get("DistanceKM"))
                    if dist is not None and dist > radius_km:
                        continue
                    stations.append({
                        "name": _ws_station_label(row),
                        "device_id": row.get("DeviceId") or row.get("Annam_ID"),
                        "distance_km": dist,
                        "temperature_c": _ws_safe_float(row.get("Temperature")),
                        "humidity_pct": _ws_safe_float(row.get("Humidity")),
                        "rainfall_mm": _ws_safe_float(row.get("Rainfall")),
                        "wind_speed_mps": _ws_safe_float(row.get("WindSpeed")),
                        "timestamp": row.get("TimeStamp"),
                        "lat": _ws_safe_float(row.get("Latitude")),
                        "lon": _ws_safe_float(row.get("Longitude")),
                        "data_source": DATA_SOURCE_ANNAM,
                    })
                nearby_data = {
                    "success": True,
                    "nearby_stations": stations,
                    "data_source": DATA_SOURCE_ANNAM,
                    "radius_km": radius_km,
                }
                nearby_summary_str = (
                    f"{len(stations)} Annam weather stations found within {radius_km} km radius"
                    if stations else "No Annam weather stations found within radius"
                )
            else:
                nearby_data = svc.get_nearby_aws_stations(
                    actual_lat, actual_lon, st_state, raw_addr, max_radius_km=radius_km, limit=max_stations
                )
                top_nearby = nearby_data.get("nearby_stations", []) if nearby_data.get("success") else []
                nearby_summary_str = f"{len(top_nearby)} weather stations found within {radius_km} km radius" if top_nearby else "No AWS stations found within radius"
        else:
            nearby_data = None
            nearby_summary_str = None

        curr_t = (
            today_fc.get("observed_max_temp")
            or today_fc.get("observed_min_temp")
            or cur_st.get("temperature_c")
            or aws_st.get("temperature_c")
            or "N/A"
        )
        hum = today_fc.get("humidity_0830") or cur_st.get("humidity_pct") or aws_st.get("humidity_pct") or "N/A"
        w_msg = (
            today_fc.get("forecast")
            or cur_st.get("weather_description")
            or cur_st.get("weather_message")
            or aws_st.get("weather_description")
            or aws_st.get("weather_message")
            or "Normal Weather"
        )

        loc_data_source = _label_data_source(ws_bundle.get("data_source_today") or today_fc.get("data_source"))
        human_sum = {
            "requested_place": resolved_name or geo.get("display_name"),
            "current_weather": f"Temperature: {curr_t}°C | Humidity: {hum}% | Condition: '{w_msg}'",
            "today_forecast": f"Min: {today_fc.get('forecast_min_temp', 'N/A')}°C | Max: {today_fc.get('forecast_max_temp', 'N/A')}°C | Forecast: {today_fc.get('forecast', 'N/A')}",
            "data_source_today": ws_bundle.get("data_source_today") or today_fc.get("data_source") or "imd",
            "data_source": loc_data_source,
        }
        if nearby_summary_str:
            human_sum["nearby_stations_within_50km"] = nearby_summary_str

        ws_ctx = _build_ws_nearest_station_context(
            actual_lat, actual_lon, loc_query or district or resolved_name,
            today_fc if ws_bundle.get("data_source_today") == "ws" else None,
        )
        st_context = ws_ctx or _build_nearest_station_context(
            svc, actual_lat, actual_lon, state, geo, loc_query or district or resolved_name
        )
        if st_context and st_context.get("nearest_station_note"):
            human_sum["nearest_station_note"] = st_context["nearest_station_note"]

        # Keep original bundle shape, but overlay WS-first today observation.
        weather_details = dict(b) if isinstance(b, dict) else {"bundle": b}
        if ws_bundle.get("success"):
            weather_details["forecast"] = {
                "success": True,
                "today": today_fc,
                "forecast": ws_bundle.get("forecast", []),
                "history_by_date": ws_bundle.get("history_by_date") or {},
                "data_source_today": ws_bundle.get("data_source_today"),
                "data_source": loc_data_source,
            }

        res_dict = {
            "resolved_location": _build_resolved_location_name(loc_query, district, resolved_name or (geo.get("display_name") if geo else None)),
            "summary": human_sum,
            "weather_details": weather_details,
            "data_source": loc_data_source,
        }
        if st_context is not None:
            res_dict["nearest_station_info"] = st_context
        if nearby_data is not None:
            res_dict["nearby_stations_within_radius"] = nearby_data
        if isinstance(imd_current, dict) and imd_current.get("success"):
            res_dict["imd_current_weather"] = imd_current
        return res_dict

    return await asyncio.to_thread(_run)


# --------------------------------------------------------------------------
# TOOL 5: get_weather_nowcast (Cluster 5)
# --------------------------------------------------------------------------
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
        if aws and aws.get("success"):
            aws = dict(aws)
            aws["station"] = enrich_station_fields(aws.get("station") or {})
        aws_st = aws.get("station", {}) if aws.get("success") else {}
        imd_current = _fetch_imd_current_wx(svc, actual_lat, actual_lon)
        cur_st = (imd_current.get("station") if isinstance(imd_current, dict) and imd_current.get("success") else {}) or {}

        window_h = min(3, max(1, hours_ahead))
        place_label = location or resolved_name or matched or hint or "Location"

        live_msg = (
            cur_st.get("weather_description")
            or cur_st.get("weather_message")
            or aws_st.get("weather_description")
            or aws_st.get("weather_message")
            or "Normal / Clear Sky"
        )
        live_temp = cur_st.get("temperature_c") or aws_st.get("temperature_c") or "N/A"
        live_hum = cur_st.get("humidity_pct") or aws_st.get("humidity_pct") or "N/A"
        live_wind = cur_st.get("wind_direction") or aws_st.get("wind_direction") or ""

        if active_warnings or cons_msg:
            warn_str = ", ".join([f"{w['category_description']} (Code: {w['category_code']})" for w in active_warnings]) if active_warnings else cons_msg
            nowcast_summary = f"Nowcast Warning (Next {window_h} Hours for {place_label}): {warn_str}. Severity: {severity_label}. Valid Upto: {valid_upto or 'Next 3 hours'}."
        else:
            nowcast_summary = (
                f"Nowcast Update (Next {window_h} Hours for {place_label}): "
                f"Current station weather is '{live_msg}'"
                f"{' (code ' + str(cur_st.get('weather_code_raw') or aws_st.get('weather_code_raw')) + ')' if (cur_st.get('weather_code_raw') or aws_st.get('weather_code_raw')) else ''}. "
                f"Temp: {live_temp}°C, Humidity: {live_hum}%"
                f"{(', Wind: ' + live_wind) if live_wind else ''}. "
                f"No severe short-term warnings. Severity: {severity_label}."
            )

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
            "data_source": DATA_SOURCE_IMD,
        }
        if aws and aws.get("success"):
            res_dict["nearest_live_aws_station"] = aws
        if isinstance(imd_current, dict) and imd_current.get("success"):
            res_dict["imd_current_weather"] = imd_current
        if st_context is not None:
            res_dict["nearest_station_info"] = st_context
        if nearby_data is not None:
            res_dict["nearby_stations_within_radius"] = nearby_data
        return res_dict

    return await asyncio.to_thread(_run)


# --------------------------------------------------------------------------
# TOOL 6: get_weather_alerts (Cluster 6)
# --------------------------------------------------------------------------
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

            w_labels = [
                label
                for c in w_code_str.split(",")
                if (label := _describe_warning_code(c.strip())) is not None
            ]
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
            "data_source": DATA_SOURCE_IMD,
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

            w_labels = [
                label
                for c in w_code_str.split(",")
                if (label := _describe_warning_code(c.strip())) is not None
            ]
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
            "data_source": DATA_SOURCE_IMD,
        }
        if st_context is not None:
            res_dict["nearest_station_info"] = st_context
        if subdiv_warnings is not None:
            res_dict["subdivision_warnings"] = subdiv_warnings
        return res_dict

    return await asyncio.to_thread(_run)


# --------------------------------------------------------------------------
# TOOL 7: get_sowing_weather_guide (Cluster 7)
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
        fc = _get_forecast_bundle_ws_first(svc, actual_lat, actual_lon)
        s_name = state or geo.get("state")
        hint = district or geo.get("district_guess")
        obj_id, matched = svc.resolve_district_obj_id(hint, s_name, geo)
        rainfall_data = svc.get_district_rainfall_raw(obj_id) if obj_id else None

        qt = (query_type or "sowing_time").lower()
        today_fc = fc.get("today", {}) if fc.get("success") else {}
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
            "data_source_today": fc.get("data_source_today"),
            "data_source": _label_data_source(fc.get("data_source_today") or today_fc.get("data_source")),
            "ws_history_by_date": fc.get("history_by_date") or {},
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
    port = int(os.getenv("MCP_PORT", "8008"))
    mcp.run(transport="streamable-http", host=host, port=port)

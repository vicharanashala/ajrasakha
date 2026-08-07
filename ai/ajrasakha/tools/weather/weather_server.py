"""
MCP Tool Server — Farmer Weather Tools (KCC clusters)
=====================================================

Seven FastMCP tools. Shared capabilities on each tool:

- Date window (universal): today / tomorrow / next N days / specific date /
  from–to ranges spanning past, today, and/or future.
  Past days → best-effort IMD observations (previous-day / past-24h).
  Today+future → forecast slice. Mixed ranges merge both into `window_days`.
  If only one of from_date / to_date is set, the other defaults to today.
- Stations: prefer the named location; if none / no station, return up to
  5 nearest AWS stations within 50 km of the coordinates.
- Nowcast: short-interval current AWS + today's outlook (`get_nowcast`;
  also optional on general / temp tools).

| # | Farmer need                            | Tool                         |
|---|----------------------------------------|------------------------------|
| 1 | General Weather & Climate Conditions   | get_general_weather          |
| 2 | Rainfall & Monsoon Inquiries           | get_rainfall_monsoon         |
| 3 | Weather Forecast & Climate Reports     | get_weather_forecast_report  |
| 4 | Temperature & Climate Conditions       | get_temperature_climate      |
| 5 | Sowing Time & Planting Season          | get_sowing_season_weather    |
| 6 | District-level weather condition       | get_district_weather         |
| 7 | Nowcast (short-interval outlook)       | get_nowcast                  |
"""

from __future__ import annotations

import logging
import math
import os
import sys
from datetime import date, datetime, timedelta
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from ajrasakha.tools.weather.imd_codes import (
    describe_nowcast_category,
    enrich_rainfall_record,
    enrich_station_fields,
    enrich_subdivision_rainfall_payload,
    enrich_subdivision_warnings_payload,
    enrich_warning_record,
)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("weather_server")

IMD_WEATHER_API_URL = os.getenv(
    "IMD_WEATHER_API_URL",
    "http://100.100.108.44:6103/imd/weather",
).strip()
IMD_CITY_BASE = os.getenv(
    "IMD_CITY_BASE", "http://100.100.108.101:18080/city/api"
).rstrip("/")
IMD_TIMEOUT_S = float(os.getenv("IMD_WEATHER_TIMEOUT_S", "12"))
DEFAULT_STATION_RADIUS_KM = float(os.getenv("WEATHER_STATION_RADIUS_KM", "50"))
DEFAULT_NEARBY_STATION_LIMIT = int(os.getenv("WEATHER_NEARBY_STATION_LIMIT", "5"))
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_UA = os.getenv("NOMINATIM_USER_AGENT", "Ajrasakha-Weather-MCP/1.0")

# IMD AWS state id map (same numbering as imd_weather service).
STATE_NAME_TO_SID: dict[str, int] = {
    "TELANGANA": 1,
    "ANDHRA PRADESH": 2,
    "HIMACHAL PRADESH": 3,
    "KERALA": 4,
    "UTTAR PRADESH": 5,
    "MEGHALAYA": 6,
    "DELHI": 7,
    "NCT OF DELHI": 7,
    "NATIONAL CAPITAL TERRITORY OF DELHI": 7,
    "RAJASTHAN": 8,
    "GUJARAT": 9,
    "ODISHA": 10,
    "ORISSA": 10,
    "BIHAR": 11,
    "CHHATTISGARH": 12,
    "KARNATAKA": 13,
    "MIZORAM": 14,
    "JHARKHAND": 15,
    "TRIPURA": 16,
    "CHANDIGARH": 17,
    "JAMMU AND KASHMIR": 18,
    "GOA": 19,
    "SIKKIM": 20,
    "MAHARASHTRA": 21,
    "HARYANA": 22,
    "LADAKH": 23,
    "ASSAM": 24,
    "TAMIL NADU": 25,
    "WEST BENGAL": 26,
    "MADHYA PRADESH": 27,
    "ARUNACHAL PRADESH": 28,
    "LAKSHADWEEP": 29,
    "MANIPUR": 30,
    "UTTARAKHAND": 31,
    "NAGALAND": 32,
    "PUDUCHERRY": 33,
    "PONDICHERRY": 33,
    "PUNJAB": 34,
    "ANDAMAN AND NICOBAR ISLANDS": 35,
    "DAMAN AND DIU": 36,
    "DADRA AND NAGAR HAVELI AND DAMAN AND DIU": 36,
}

ISO3166_IN_TO_SID: dict[str, int] = {
    "IN-AP": 2, "IN-AR": 28, "IN-AS": 24, "IN-BR": 11, "IN-CT": 12,
    "IN-GA": 19, "IN-GJ": 9, "IN-HR": 22, "IN-HP": 3, "IN-JH": 15,
    "IN-KA": 13, "IN-KL": 4, "IN-MP": 27, "IN-MH": 21, "IN-MN": 30,
    "IN-ML": 6, "IN-MZ": 14, "IN-NL": 32, "IN-OR": 10, "IN-PB": 34,
    "IN-RJ": 8, "IN-SK": 20, "IN-TN": 25, "IN-TG": 1, "IN-TR": 16,
    "IN-UP": 5, "IN-UT": 31, "IN-WB": 26, "IN-AN": 35, "IN-CH": 17,
    "IN-DD": 36, "IN-DN": 36, "IN-LD": 29, "IN-DL": 7, "IN-JK": 18,
    "IN-LA": 23, "IN-PY": 33,
}

mcp = FastMCP(
    "ajrasakha-weather-mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    ),
)


# --------------------------------------------------------------------------
# Shared helpers — coords, dates, IMD fetch, nearby stations
# --------------------------------------------------------------------------

def _validate_coords(latitude: float, longitude: float) -> Optional[str]:
    if not (-90.0 <= latitude <= 90.0):
        return f"Invalid latitude {latitude}: must be between -90 and 90"
    if not (-180.0 <= longitude <= 180.0):
        return f"Invalid longitude {longitude}: must be between -180 and 180"
    return None


def _parse_iso_date(value: Optional[str]) -> Optional[date]:
    if value is None or not str(value).strip():
        return None
    text = str(value).strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
    return None


def resolve_date_window(
    *,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: Optional[int] = None,
    as_of: Optional[date] = None,
) -> dict[str, Any]:
    """
    Resolve a farmer date window (universal for all weather tools).

    Rules:
    - days N → today .. today+(N-1)
    - only from_date → to_date = today
    - only to_date → from_date = today
    - neither dates nor days → full available forecast (no slice)

    Classification (`kind`):
    - past / today / future / mixed / next_days / full
    Past days use best-effort observations; today+future use forecast.

    `as_of` overrides "today" (for tests / deterministic replay).
    """
    today = as_of or date.today()
    start: Optional[date] = None
    end: Optional[date] = None
    mode = "full"

    if days is not None:
        try:
            n = int(days)
        except (TypeError, ValueError):
            n = 1
        n = max(1, min(n, 16))
        start = today
        end = today + timedelta(days=n - 1)
        mode = "next_days"
    else:
        start = _parse_iso_date(from_date)
        end = _parse_iso_date(to_date)
        if start and not end:
            end = today
            mode = "interval_default_end_today"
        elif end and not start:
            start = today
            mode = "interval_default_start_today"
        elif start and end:
            mode = "interval"
        else:
            return {
                "mode": "full",
                "kind": "full",
                "from_date": None,
                "to_date": None,
                "today": today.isoformat(),
                "slice": False,
                "past_only": False,
                "includes_past": False,
                "includes_today": False,
                "includes_future": False,
                "past_from": None,
                "past_to": None,
                "forecast_from": None,
                "forecast_to": None,
            }

    assert start is not None and end is not None
    if end < start:
        start, end = end, start

    past_only = end < today
    includes_past = start < today
    includes_today = start <= today <= end
    includes_future = end > today

    if past_only:
        mode = "past_days"
        kind = "past"
    elif includes_past and (includes_today or includes_future):
        mode = "mixed"
        kind = "mixed"
    elif mode == "next_days":
        kind = "next_days"
    elif includes_today and not includes_future and start == end:
        kind = "today"
    elif start > today:
        kind = "future"
    elif includes_today:
        kind = "today"
    else:
        kind = "future"

    past_from = past_to = None
    if includes_past:
        past_from = start.isoformat()
        past_to = min(end, today - timedelta(days=1)).isoformat()

    forecast_from = forecast_to = None
    if not past_only:
        forecast_from = max(start, today).isoformat()
        forecast_to = end.isoformat()

    return {
        "mode": mode,
        "kind": kind,
        "from_date": start.isoformat(),
        "to_date": end.isoformat(),
        "today": today.isoformat(),
        "slice": True,
        "day_count": (end - start).days + 1,
        "past_only": past_only,
        "includes_past": includes_past,
        "includes_today": includes_today,
        "includes_future": includes_future,
        "past_from": past_from,
        "past_to": past_to,
        "forecast_from": forecast_from,
        "forecast_to": forecast_to,
    }


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _enrich_imd_payload(data: dict[str, Any], data_type: str) -> dict[str, Any]:
    """Attach human-readable IMD code descriptions wherever codes appear."""
    dt = (data_type or data.get("data_type") or "").strip().lower()
    result = data.get("result")

    def _enrich_station_result(body: Any) -> Any:
        if not isinstance(body, dict):
            return body
        out = dict(body)
        station = out.get("station")
        if isinstance(station, dict):
            out["station"] = enrich_station_fields(station)
        return out

    def _enrich_warning_body(body: Any) -> Any:
        if not isinstance(body, dict):
            return body
        out = dict(body)
        record = out.get("record")
        if isinstance(record, dict):
            out["record"] = enrich_warning_record(record)
        return out

    def _enrich_rainfall_body(body: Any) -> Any:
        if not isinstance(body, dict):
            return body
        out = dict(body)
        record = out.get("record")
        if isinstance(record, dict):
            out["record"] = enrich_rainfall_record(record)
        return out

    if dt == "current_aws":
        if isinstance(result, dict):
            data["result"] = _enrich_station_result(result)
        elif isinstance(data.get("station"), dict):
            data["station"] = enrich_station_fields(data["station"])
        return data

    if dt in ("district_warnings", "warnings"):
        if isinstance(result, dict):
            data["result"] = _enrich_warning_body(result)
        return data

    if dt in ("district_rainfall", "rainfall"):
        if isinstance(result, dict):
            data["result"] = _enrich_rainfall_body(result)
        return data

    if dt == "district":
        if isinstance(result, dict):
            out = dict(result)
            if isinstance(out.get("warnings"), dict):
                out["warnings"] = _enrich_warning_body(out["warnings"])
            if isinstance(out.get("rainfall"), dict):
                out["rainfall"] = _enrich_rainfall_body(out["rainfall"])
            data["result"] = out
        return data

    if dt == "bundle" and isinstance(result, dict):
        out = dict(result)
        if isinstance(out.get("current_aws"), dict):
            out["current_aws"] = _enrich_station_result(out["current_aws"])
        district = out.get("district")
        if isinstance(district, dict):
            d_out = dict(district)
            if isinstance(d_out.get("warnings"), dict):
                d_out["warnings"] = _enrich_warning_body(d_out["warnings"])
            if isinstance(d_out.get("rainfall"), dict):
                d_out["rainfall"] = _enrich_rainfall_body(d_out["rainfall"])
            out["district"] = d_out
        data["result"] = out
        return data

    if dt in ("subdivision_warnings", "sub_warnings"):
        if isinstance(result, dict):
            data["result"] = enrich_subdivision_warnings_payload(result)
        return data

    if dt in ("subdivision_rainfall", "sub_rainfall"):
        if isinstance(result, dict):
            data["result"] = enrich_subdivision_rainfall_payload(result)
        return data

    return data


def _fetch_imd(latitude: float, longitude: float, data_type: str) -> dict[str, Any]:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "data_type": data_type,
    }
    try:
        with httpx.Client(timeout=IMD_TIMEOUT_S) as client:
            resp = client.get(IMD_WEATHER_API_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "IMD HTTP %s for data_type=%s: %s",
            exc.response.status_code,
            data_type,
            (exc.response.text or "")[:200],
        )
        return {
            "success": False,
            "data_type": data_type,
            "error": f"http_{exc.response.status_code}",
            "detail": (exc.response.text or "")[:300],
        }
    except Exception as exc:
        logger.warning("IMD request failed data_type=%s: %s", data_type, exc)
        return {
            "success": False,
            "data_type": data_type,
            "error": "request_failed",
            "detail": str(exc),
        }

    if isinstance(data, dict) and data.get("success") is False:
        return data
    if isinstance(data, dict):
        data.setdefault("success", True)
        data.setdefault("data_type", data_type)
        return _enrich_imd_payload(data, data_type)
    return {"success": True, "data_type": data_type, "raw": data}


def _reverse_geocode(lat: float, lon: float) -> dict[str, Any]:
    params = {
        "lat": lat,
        "lon": lon,
        "format": "json",
        "addressdetails": 1,
    }
    headers = {"User-Agent": NOMINATIM_UA}
    try:
        with httpx.Client(timeout=IMD_TIMEOUT_S) as client:
            resp = client.get(NOMINATIM_URL, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        return {"success": False, "error": f"geocode_failed: {exc}"}

    addr = data.get("address") or {}
    state = addr.get("state")
    district = (
        addr.get("state_district")
        or addr.get("county")
        or addr.get("city_district")
        or addr.get("city")
    )
    return {
        "success": True,
        "display_name": data.get("display_name"),
        "state": state,
        "district_guess": district,
        "iso_3166_2": addr.get("ISO3166-2-lvl4"),
        "raw_address": addr,
    }


def _resolve_state_sid(state_name: Optional[str], raw_address: Optional[dict]) -> Optional[int]:
    if state_name:
        key = state_name.strip().upper().replace("_", " ")
        if key in STATE_NAME_TO_SID:
            return STATE_NAME_TO_SID[key]
    if raw_address:
        iso = (raw_address.get("ISO3166-2-lvl4") or "").strip().upper()
        if iso in ISO3166_IN_TO_SID:
            return ISO3166_IN_TO_SID[iso]
    return None


def _normalize_aws_station(raw: dict[str, Any], distance_km: float) -> dict[str, Any]:
    station = {
        "name": raw.get("STATION"),
        "district": raw.get("DISTRICT"),
        "state": raw.get("STATE"),
        "call_sign": raw.get("CALL_SIGN"),
        "date": raw.get("DATE"),
        "time": raw.get("TIME"),
        "temperature_c": raw.get("CURR_TEMP"),
        "feel_like_c": raw.get("Feel Like"),
        "humidity_pct": raw.get("RH"),
        "wind_speed_kmph": raw.get("WIND_SPEED"),
        "wind_direction_deg": raw.get("WIND_DIRECTION"),
        "mslp": raw.get("MSLP"),
        "weather_message": raw.get("WEATHER_MESSAGE"),
        "weather_code": raw.get("WEATHER_CODE") or raw.get("WEATHER"),
        "latitude": raw.get("Latitude"),
        "longitude": raw.get("Longitude"),
        "distance_km": round(distance_km, 2),
    }
    # Attach nowcast category description when IMD returns a Cat/code field.
    for key in ("NOWCAST_CAT", "NOWCAST_CODE", "CAT", "CATEGORY"):
        if raw.get(key) is not None and str(raw.get(key)).strip() != "":
            station["nowcast_category_code"] = raw.get(key)
            station["nowcast_category"] = describe_nowcast_category(raw.get(key))
            break
    return enrich_station_fields(station)


def get_nearby_aws_stations(
    latitude: float,
    longitude: float,
    *,
    radius_km: float = DEFAULT_STATION_RADIUS_KM,
    limit: int = DEFAULT_NEARBY_STATION_LIMIT,
) -> dict[str, Any]:
    """Return up to `limit` AWS stations within `radius_km` of lat/lon."""
    geo = _reverse_geocode(latitude, longitude)
    if not geo.get("success"):
        return {
            "success": False,
            "error": geo.get("error") or "geocode_failed",
            "radius_km": radius_km,
            "limit": limit,
            "stations": [],
        }

    sid = _resolve_state_sid(geo.get("state"), geo.get("raw_address"))
    if sid is None:
        return {
            "success": False,
            "error": "Could not map location to IMD AWS state id",
            "geocode": geo,
            "radius_km": radius_km,
            "limit": limit,
            "stations": [],
        }

    try:
        with httpx.Client(timeout=IMD_TIMEOUT_S) as client:
            resp = client.get(
                f"{IMD_CITY_BASE}/aws_data_api.php",
                params={"sid": sid},
            )
            resp.raise_for_status()
            raw = resp.json()
    except Exception as exc:
        return {
            "success": False,
            "error": f"aws_feed_failed: {exc}",
            "geocode": geo,
            "imd_state_sid": sid,
            "radius_km": radius_km,
            "limit": limit,
            "stations": [],
        }

    rows = raw if isinstance(raw, list) else [raw] if raw else []
    ranked: list[tuple[float, dict[str, Any]]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        slat = _safe_float(row.get("Latitude"))
        slon = _safe_float(row.get("Longitude"))
        if slat is None or slon is None:
            continue
        dkm = _haversine_km(latitude, longitude, slat, slon)
        if dkm <= radius_km:
            ranked.append((dkm, row))

    ranked.sort(key=lambda item: item[0])
    stations = [
        _normalize_aws_station(row, dkm)
        for dkm, row in ranked[: max(1, limit)]
    ]
    return {
        "success": bool(stations),
        "geocode": geo,
        "imd_state_sid": sid,
        "radius_km": radius_km,
        "limit": limit,
        "stations_in_radius": len(ranked),
        "stations": stations,
        "error": None if stations else f"No AWS stations within {radius_km} km",
    }


def _peel_forecast_body(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    inner = payload.get("result")
    if isinstance(inner, dict) and ("today" in inner or "forecast" in inner):
        return inner
    if "today" in payload or "forecast" in payload:
        return payload
    return inner if isinstance(inner, dict) else payload


def _assign_forecast_calendar_days(body: dict[str, Any]) -> list[dict[str, Any]]:
    """Attach ISO dates to today + Day_2.. entries (IMD day index → calendar)."""
    today = date.today()
    out: list[dict[str, Any]] = []
    today_block = body.get("today") if isinstance(body.get("today"), dict) else {}
    if today_block:
        out.append({
            "date": today.isoformat(),
            "day_index": 1,
            "is_today": True,
            "min_temp": today_block.get("forecast_min_temp") or today_block.get("observed_min_temp"),
            "max_temp": today_block.get("forecast_max_temp") or today_block.get("observed_max_temp"),
            "forecast": today_block.get("forecast"),
            "past_24hrs_rainfall": today_block.get("past_24hrs_rainfall"),
            "station": today_block.get("station"),
            "distance_to_station_km": today_block.get("distance_to_station_km"),
            "raw": today_block,
        })
    for day in body.get("forecast") or []:
        if not isinstance(day, dict):
            continue
        idx = day.get("day")
        try:
            day_num = int(idx)
        except (TypeError, ValueError):
            day_num = len(out) + 1
        # IMD Day_2 == tomorrow (offset 1 from today)
        offset = max(0, day_num - 1)
        out.append({
            "date": (today + timedelta(days=offset)).isoformat(),
            "day_index": day_num,
            "is_today": False,
            "min_temp": day.get("min_temp"),
            "max_temp": day.get("max_temp"),
            "forecast": day.get("forecast"),
            "raw": day,
        })
    return out


_PAST_HISTORY_UNAVAILABLE_NOTE = (
    "A full day-by-day historical climate archive is not available from IMD in this service "
    "for every past date. Where possible, previous-day station observations and past-24-hour "
    "rainfall near the location are shown instead."
)


def _pick_nearest_cityweather_station(
    latitude: float,
    longitude: float,
    records: list[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    best: Optional[tuple[float, dict[str, Any]]] = None
    for rec in records:
        if not isinstance(rec, dict):
            continue
        slat = _safe_float(rec.get("Latitude"))
        slon = _safe_float(rec.get("Longitude"))
        if slat is None or slon is None:
            continue
        d = _haversine_km(latitude, longitude, slat, slon)
        if best is None or d < best[0]:
            best = (d, rec)
    if best:
        return {**best[1], "_distance_km": round(best[0], 2)}
    return records[0] if records else None


def _fetch_nearest_cityweather(latitude: float, longitude: float) -> dict[str, Any]:
    """Nearest IMD cityweather_loc.php station (includes previous-day fields)."""
    try:
        with httpx.Client(timeout=IMD_TIMEOUT_S) as client:
            resp = client.get(
                f"{IMD_CITY_BASE}/cityweather_loc.php",
                params={"lat": latitude, "lon": longitude},
            )
            resp.raise_for_status()
            raw = resp.json()
    except Exception as exc:
        return {"success": False, "error": f"cityweather_failed: {exc}"}

    records = raw if isinstance(raw, list) else [raw] if isinstance(raw, dict) else []
    station = _pick_nearest_cityweather_station(latitude, longitude, records)
    if not station:
        return {"success": False, "error": "No cityweather station near location"}
    return {"success": True, "station": station, "stations_returned": len(records)}


def _nonempty(value: Any) -> bool:
    if value is None:
        return False
    text = str(value).strip()
    return text != "" and text.upper() not in {"NA", "NIL", "NONE", "NULL"}


def build_past_observations(
    latitude: float,
    longitude: float,
    window: dict[str, Any],
) -> dict[str, Any]:
    """
    Build best-effort past climate from IMD fields that actually exist:
    previous-day max/humidity, past-24h rainfall, and district rainfall stats.
    """
    city = _fetch_nearest_cityweather(latitude, longitude)
    rainfall = _fetch_imd(latitude, longitude, "district_rainfall")
    station = city.get("station") if city.get("success") else None
    today = date.today()
    yesterday = today - timedelta(days=1)

    previous_day: Optional[dict[str, Any]] = None
    past_24h = None
    station_name = None
    distance_km = None
    as_of = None

    if isinstance(station, dict):
        station_name = station.get("Station_Name")
        distance_km = station.get("_distance_km")
        as_of = station.get("Date") or today.isoformat()
        past_24h = station.get("Past_24_hrs_Rainfall")
        prev = {
            "date": yesterday.isoformat(),
            "max_temp": station.get("Previous_Day_Max_temp"),
            "max_temp_departure_from_normal": station.get(
                "Previous_Day_Max_Departure_from_Normal"
            ),
            "humidity_1730": station.get("Previous_Day_Relative_Humidity_at_1730"),
            "today_observed_min_temp": station.get("Today_Min_temp"),
            "today_observed_max_temp": station.get("Today_Max_temp"),
        }
        if any(
            _nonempty(prev.get(k))
            for k in (
                "max_temp",
                "humidity_1730",
                "today_observed_min_temp",
                "today_observed_max_temp",
            )
        ):
            previous_day = prev

    rain_body = rainfall.get("result") if isinstance(rainfall, dict) else None
    rain_record = None
    if isinstance(rain_body, dict):
        rec = rain_body.get("record")
        if isinstance(rec, dict):
            rain_record = rec

    has_data = bool(previous_day) or _nonempty(past_24h) or bool(rain_record)
    requested_days = window.get("day_count") or 1
    coverage_note = _PAST_HISTORY_UNAVAILABLE_NOTE
    if has_data and int(requested_days) > 1:
        coverage_note = (
            f"Requested past {requested_days} days, but IMD near this location only exposes "
            "previous-day station observations plus past-24-hour rainfall and district "
            "rainfall statistics (daily/weekly aggregates) — not a full day-by-day archive."
        )
    elif has_data:
        coverage_note = (
            "Showing previous-day station observations and past-24-hour rainfall available "
            "from IMD near this location."
        )

    return {
        "success": has_data,
        "coverage": "previous_day_and_past_24h" if has_data else "none",
        "requested_window": {
            "from_date": window.get("from_date"),
            "to_date": window.get("to_date"),
            "day_count": window.get("day_count"),
        },
        "station": station_name,
        "station_as_of_date": as_of,
        "distance_to_station_km": distance_km,
        "previous_day": previous_day,
        "past_24hrs_rainfall_mm": past_24h,
        "district_rainfall": rainfall if isinstance(rainfall, dict) else None,
        "note": coverage_note,
        "cityweather_error": None if city.get("success") else city.get("error"),
    }


def slice_forecast_by_window(
    forecast_payload: dict[str, Any],
    window: dict[str, Any],
) -> dict[str, Any]:
    """Filter forecast payload to the resolved date window; attach dated days."""
    body = _peel_forecast_body(forecast_payload)
    dated = _assign_forecast_calendar_days(body if isinstance(body, dict) else {})
    if not window.get("slice"):
        return {
            "success": forecast_payload.get("success", True),
            "date_window": window,
            "days": dated,
            "source": forecast_payload,
        }

    # Entirely past window: no forward forecast days; past observations handled separately.
    if window.get("past_only"):
        return {
            "success": True,
            "date_window": window,
            "days": [],
            "source": forecast_payload,
            "unavailable_reason": "past_day_by_day_archive_not_available",
            "note": _PAST_HISTORY_UNAVAILABLE_NOTE,
        }

    start = date.fromisoformat(window["from_date"])
    end = date.fromisoformat(window["to_date"])
    today = date.today()
    filtered = [
        d for d in dated
        if start <= date.fromisoformat(d["date"]) <= end
    ]

    note = None
    unavailable_reason = None
    if window.get("includes_past") and start < today:
        filtered = [
            d for d in filtered
            if date.fromisoformat(d["date"]) >= today
        ]
        note = (
            "Past dates in the requested window have no day-by-day IMD archive; "
            "showing best-available past observations plus today/upcoming forecast days."
        )
        unavailable_reason = "past_partially_unavailable"

    if not filtered and note is None:
        note = (
            "No forecast days in the requested date window "
            "(IMD window is typically today + ~6 days)."
        )

    return {
        "success": bool(filtered) or forecast_payload.get("success", True),
        "date_window": window,
        "days": filtered,
        "source": forecast_payload,
        "unavailable_reason": unavailable_reason,
        "note": note,
    }


def _district_daily_snapshot(rainfall_payload: Any) -> dict[str, Any]:
    """Pull compact daily fields from a district_rainfall IMD payload."""
    if not isinstance(rainfall_payload, dict):
        return {}
    body = rainfall_payload.get("result")
    record = None
    if isinstance(body, dict):
        rec = body.get("record")
        if isinstance(rec, dict):
            record = rec
        elif isinstance(body.get("result"), dict) and isinstance(body["result"].get("record"), dict):
            record = body["result"]["record"]
    if not isinstance(record, dict):
        return {}
    out: dict[str, Any] = {}
    for src, dest in (
        ("Daily Actual", "district_daily_actual"),
        ("Daily Normal", "district_daily_normal"),
        ("Daily Departure Per", "district_daily_departure"),
        ("Daily Category", "district_daily_category"),
    ):
        val = record.get(src)
        if _nonempty(val):
            out[dest] = val
    return out


def build_window_timeline(
    window: dict[str, Any],
    *,
    forecast_days: Optional[list[dict[str, Any]]] = None,
    past: Optional[dict[str, Any]] = None,
    as_of: Optional[date] = None,
) -> list[dict[str, Any]]:
    """
    Universal day-by-day timeline for a resolved window.

    Past days → best-effort observations (IMD has no full archive).
    Today/future → forecast rows when available.
    """
    forecast_days = forecast_days or []
    if not window.get("slice") or not window.get("from_date") or not window.get("to_date"):
        return [
            {**d, "source": "forecast", "kind": "forecast", "available": True}
            for d in forecast_days
            if isinstance(d, dict)
        ]

    start = date.fromisoformat(window["from_date"])
    end = date.fromisoformat(window["to_date"])
    today = as_of or (
        date.fromisoformat(window["today"]) if window.get("today") else date.today()
    )
    by_date = {
        str(d.get("date")): d
        for d in forecast_days
        if isinstance(d, dict) and d.get("date")
    }
    past = past if isinstance(past, dict) else {}
    prev = past.get("previous_day") if isinstance(past.get("previous_day"), dict) else {}
    rain_snap = _district_daily_snapshot(past.get("district_rainfall"))
    past_24h = past.get("past_24hrs_rainfall_mm")

    days: list[dict[str, Any]] = []
    cur = start
    while cur <= end:
        iso = cur.isoformat()
        if cur < today:
            entry: dict[str, Any] = {
                "date": iso,
                "source": "observed",
                "kind": "past",
                "available": False,
                "summary": "Day-by-day archive not available from IMD",
            }
            # Previous calendar day is the only station day IMD exposes reliably.
            if prev.get("date") == iso or (today - cur).days == 1:
                entry["available"] = any(
                    _nonempty(prev.get(k))
                    for k in ("max_temp", "humidity_1730", "today_observed_min_temp")
                ) or _nonempty(past_24h) or bool(rain_snap)
                if prev.get("date") == iso or (today - cur).days == 1:
                    if _nonempty(prev.get("max_temp")):
                        entry["max_temp"] = prev.get("max_temp")
                    if _nonempty(prev.get("humidity_1730")):
                        entry["humidity_1730"] = prev.get("humidity_1730")
                if _nonempty(past_24h) and (today - cur).days == 1:
                    entry["past_24hrs_rainfall"] = past_24h
                if rain_snap and (today - cur).days == 1:
                    entry.update(rain_snap)
                bits = []
                if _nonempty(entry.get("past_24hrs_rainfall")):
                    bits.append(f"past 24h rain {entry['past_24hrs_rainfall']} mm")
                if _nonempty(entry.get("district_daily_actual")):
                    bits.append(f"district daily {entry['district_daily_actual']} mm")
                if _nonempty(entry.get("district_daily_category")):
                    bits.append(str(entry["district_daily_category"]))
                if _nonempty(entry.get("max_temp")):
                    bits.append(f"max {entry['max_temp']}°C")
                if bits:
                    entry["summary"] = "Observed (best available): " + "; ".join(bits)
                    entry["available"] = True
                elif not entry["available"]:
                    entry["summary"] = (
                        "No day-by-day IMD archive for this past date "
                        "(only previous-day / past-24h fields exist)."
                    )
            days.append(entry)
        else:
            fd = by_date.get(iso)
            kind = "today" if cur == today else "forecast"
            if fd:
                days.append({
                    **fd,
                    "source": "forecast",
                    "kind": kind,
                    "available": True,
                    "summary": fd.get("forecast"),
                })
            else:
                days.append({
                    "date": iso,
                    "source": "forecast",
                    "kind": kind,
                    "available": False,
                    "summary": "No forecast available for this date",
                })
        cur += timedelta(days=1)
    return days


def apply_date_window_coverage(
    latitude: float,
    longitude: float,
    window: dict[str, Any],
    *,
    forecast_payload: Optional[dict[str, Any]] = None,
    fetch_forecast: bool = True,
) -> dict[str, Any]:
    """
    Universal past / today / future coverage block for every weather tool.

    - Past portion → build_past_observations (best effort)
    - Today/future → sliced forecast
    - window_days → merged day-by-day timeline
    """
    out: dict[str, Any] = {"date_window": window}
    past: Optional[dict[str, Any]] = None
    if window.get("includes_past") or window.get("past_only"):
        past = build_past_observations(latitude, longitude, window)
        out["past_observations"] = past

    sliced: Optional[dict[str, Any]] = None
    if window.get("past_only"):
        sliced = {
            "success": True,
            "date_window": window,
            "days": [],
            "unavailable_reason": "past_day_by_day_archive_not_available",
            "note": (past or {}).get("note") or _PAST_HISTORY_UNAVAILABLE_NOTE,
        }
    elif fetch_forecast and (window.get("slice") or forecast_payload is not None):
        if forecast_payload is None:
            forecast_payload = _fetch_imd(latitude, longitude, "forecast")
        sliced = slice_forecast_by_window(forecast_payload, window)
    if sliced is not None:
        out["forecast_window"] = sliced

    forecast_days = list((sliced or {}).get("days") or [])
    out["window_days"] = build_window_timeline(
        window, forecast_days=forecast_days, past=past
    )

    notes: list[str] = []
    if past and past.get("note") and (window.get("includes_past") or window.get("past_only")):
        notes.append(str(past["note"]))
    if sliced and sliced.get("note"):
        notes.append(str(sliced["note"]))
    # Preserve order, drop duplicates
    seen: set[str] = set()
    uniq = []
    for n in notes:
        if n and n not in seen:
            seen.add(n)
            uniq.append(n)
    if uniq:
        out["coverage_note"] = " ".join(uniq)
    return out


def extract_rainfall_from_forecast_days(days: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Rain-focused projection of dated forecast days."""
    out = []
    for d in days:
        text = str(d.get("forecast") or d.get("summary") or "").lower()
        rainish = any(
            k in text
            for k in ("rain", "shower", "thunder", "drizzle", "storm", "wet")
        )
        source = d.get("source") or "forecast"
        if source == "observed":
            rainish_val: Optional[bool] = None
        else:
            rainish_val = rainish
        out.append({
            "date": d.get("date"),
            "day_index": d.get("day_index"),
            "source": source,
            "kind": d.get("kind") or source,
            "available": d.get("available", True),
            "forecast": d.get("forecast") or d.get("summary"),
            "summary": d.get("summary"),
            "past_24hrs_rainfall": d.get("past_24hrs_rainfall"),
            "district_daily_actual": d.get("district_daily_actual"),
            "district_daily_category": d.get("district_daily_category"),
            "rain_likely": rainish_val,
            "min_temp": d.get("min_temp"),
            "max_temp": d.get("max_temp"),
        })
    return out


def rainfall_focus_for_window(
    window: dict[str, Any],
    *,
    include_forecast: bool,
    status_only: bool = False,
) -> str:
    """
    daily  — today status: compact daily district stats only
    window — explicit dates / ranges / mixed: day-by-day timeline
    outlook — next-N-days rain outlook (no weekly/monthly dump)
    """
    if status_only or (
        window.get("kind") == "today"
        and not include_forecast
        and int(window.get("day_count") or 0) <= 1
    ):
        return "daily"
    if not window.get("slice"):
        return "outlook"
    if window.get("mode") == "next_days":
        return "outlook"
    return "window"

def extract_temperature_from_forecast_days(days: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "date": d.get("date"),
            "day_index": d.get("day_index"),
            "min_temp": d.get("min_temp"),
            "max_temp": d.get("max_temp"),
            "forecast": d.get("forecast"),
            "is_today": d.get("is_today"),
        }
        for d in days
    ]


def build_nowcast_block(
    latitude: float,
    longitude: float,
    current_payload: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Short-interval outlook: live AWS + today's forecast only (no new category)."""
    current = current_payload or _fetch_imd(latitude, longitude, "current_aws")
    forecast = _fetch_imd(latitude, longitude, "forecast")
    window = resolve_date_window(days=1)
    sliced = slice_forecast_by_window(forecast, window)
    return {
        "success": bool(current.get("success", True)) or bool(sliced.get("days")),
        "interval": "short_today",
        "description": "Nowcast-style short interval: current observation + today's outlook",
        "current": current,
        "today": (sliced.get("days") or [None])[0],
    }


def resolve_stations_for_query(
    latitude: float,
    longitude: float,
    *,
    location_specified: bool,
    primary_payload: Optional[dict[str, Any]] = None,
    radius_km: float = DEFAULT_STATION_RADIUS_KM,
    limit: int = DEFAULT_NEARBY_STATION_LIMIT,
) -> dict[str, Any]:
    """
    Location rules:
    - No specific location → nearest `limit` stations within radius.
    - Location given → use primary station if present; else same nearby list.
    """
    nearby = get_nearby_aws_stations(
        latitude, longitude, radius_km=radius_km, limit=limit
    )
    primary_ok = False
    primary_station = None
    if primary_payload and isinstance(primary_payload, dict):
        body = primary_payload.get("result")
        if isinstance(body, dict) and body.get("station"):
            primary_ok = bool(body.get("success", True))
            primary_station = {
                **body.get("station"),
                "distance_km": body.get("distance_km"),
            }
        elif primary_payload.get("station"):
            primary_ok = True
            primary_station = primary_payload.get("station")

    if not location_specified:
        return {
            "mode": "nearby_no_specific_location",
            "radius_km": radius_km,
            "limit": limit,
            "stations": nearby.get("stations") or [],
            "nearby": nearby,
            "primary_station": None,
        }

    if primary_ok and primary_station:
        return {
            "mode": "location_specific",
            "radius_km": radius_km,
            "limit": limit,
            "stations": [primary_station],
            "nearby": nearby,
            "primary_station": primary_station,
        }

    return {
        "mode": "location_fallback_nearby",
        "radius_km": radius_km,
        "limit": limit,
        "stations": nearby.get("stations") or [],
        "nearby": nearby,
        "primary_station": None,
        "note": "No weather station matched the named location; showing nearest stations within radius.",
    }


def _location_fields(
    city: Optional[str],
    district: Optional[str],
    state: Optional[str],
    block: Optional[str],
) -> dict[str, Any]:
    return {
        "city": city,
        "district": district,
        "state": state,
        "block": block,
    }


def _has_named_place(
    city: Optional[str],
    district: Optional[str],
    state: Optional[str],
    block: Optional[str] = None,
) -> bool:
    return any(
        str(v).strip()
        for v in (city, district, state, block)
        if v is not None
    )


def _envelope(
    *,
    tool: str,
    farmer_need: str,
    kcc_cluster: int,
    latitude: float,
    longitude: float,
    location: dict[str, Any],
    payload: dict[str, Any],
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "success": bool(payload.get("success", True)) and "error" not in payload,
        "tool": tool,
        "farmer_need": farmer_need,
        "kcc_cluster": kcc_cluster,
        "location": {
            "latitude": latitude,
            "longitude": longitude,
            **{k: v for k, v in location.items() if v is not None and v != ""},
        },
        "result": payload,
    }
    if extra:
        out.update(extra)
    if payload.get("error") and out["success"]:
        out["success"] = False
    return out


# --------------------------------------------------------------------------
# 1) General Weather & Climate Conditions
# --------------------------------------------------------------------------

@mcp.tool()
def get_general_weather(
    latitude: float,
    longitude: float,
    city: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: Optional[int] = None,
    nowcast: bool = False,
    location_specified: Optional[bool] = None,
    radius_km: float = DEFAULT_STATION_RADIUS_KM,
) -> dict:
    """
    KCC cluster 1 — General Weather & Climate Conditions.

    Current / general mausam info. Supports date window, nowcast (short interval),
    and nearby stations (up to 5 within radius_km, default 50) when location is
    unspecified or no station matches.
    """
    err = _validate_coords(latitude, longitude)
    if err:
        return {"success": False, "tool": "get_general_weather", "error": err}

    named = _has_named_place(city, district, state)
    loc_specified = named if location_specified is None else bool(location_specified)
    window = resolve_date_window(from_date=from_date, to_date=to_date, days=days)

    current = _fetch_imd(latitude, longitude, "current_aws")
    stations = resolve_stations_for_query(
        latitude,
        longitude,
        location_specified=loc_specified,
        primary_payload=current,
        radius_km=radius_km,
    )

    result: dict[str, Any] = {
        "success": True,
        "current": current,
        "stations": stations,
        "date_window": window,
    }
    if nowcast or (
        window.get("slice")
        and window.get("day_count") == 1
        and window.get("from_date") == window.get("today")
    ):
        result["nowcast"] = build_nowcast_block(latitude, longitude, current)
    if window.get("slice"):
        coverage = apply_date_window_coverage(latitude, longitude, window)
        result["date_window"] = coverage.get("date_window") or window
        if coverage.get("past_observations"):
            result["past_observations"] = coverage["past_observations"]
        if coverage.get("forecast_window"):
            result["forecast_window"] = coverage["forecast_window"]
        if coverage.get("window_days"):
            result["window_days"] = coverage["window_days"]
        if coverage.get("coverage_note"):
            result["coverage_note"] = coverage["coverage_note"]

    result["success"] = (
        bool(stations.get("stations"))
        or bool(current.get("success", True))
        or bool(result.get("window_days"))
        or bool(result.get("past_observations", {}).get("success"))
    )
    return _envelope(
        tool="get_general_weather",
        farmer_need="General Weather & Climate Conditions",
        kcc_cluster=1,
        latitude=latitude,
        longitude=longitude,
        location=_location_fields(city, district, state, None),
        payload=result,
        extra={"location_specified": loc_specified},
    )


# --------------------------------------------------------------------------
# 2) Rainfall & Monsoon Inquiries
# --------------------------------------------------------------------------

@mcp.tool()
def get_rainfall_monsoon(
    latitude: float,
    longitude: float,
    district: Optional[str] = None,
    state: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: Optional[int] = None,
    include_forecast: bool = True,
    location_specified: Optional[bool] = None,
    radius_km: float = DEFAULT_STATION_RADIUS_KM,
) -> dict:
    """
    KCC cluster 2 — Rainfall & Monsoon Inquiries.

    Rainfall / monsoon for today, next N days, a specific date, or a date
    interval (missing end/start defaults to today). Past / mixed / future
    windows use the shared date-window coverage (observations + forecast).
    """
    err = _validate_coords(latitude, longitude)
    if err:
        return {"success": False, "tool": "get_rainfall_monsoon", "error": err}

    named = _has_named_place(None, district, state)
    loc_specified = named if location_specified is None else bool(location_specified)

    # Multi-day outlook default only when forecast is requested and no window given.
    if days is not None:
        try:
            days = int(days)
        except (TypeError, ValueError):
            days = 3 if include_forecast else 1
    if from_date is None and to_date is None and days is None:
        days = 3 if include_forecast else 1

    window = resolve_date_window(from_date=from_date, to_date=to_date, days=days)
    status_only = (
        not include_forecast
        and window.get("kind") == "today"
        and int(window.get("day_count") or 0) <= 1
    )
    rainfall_focus = rainfall_focus_for_window(
        window, include_forecast=include_forecast, status_only=status_only
    )
    logger.info(
        "get_rainfall_monsoon days=%s window=%s focus=%s loc_specified=%s",
        days,
        window,
        rainfall_focus,
        loc_specified,
    )

    rainfall = _fetch_imd(latitude, longitude, "district_rainfall")
    # Always assemble past+forecast timeline for sliced windows.
    need_forecast = include_forecast or bool(
        window.get("includes_today") or window.get("includes_future")
    )
    coverage = apply_date_window_coverage(
        latitude,
        longitude,
        window,
        fetch_forecast=need_forecast and not status_only,
    )
    # Prefer district rainfall already fetched for past obs enrichment.
    if coverage.get("past_observations") and isinstance(rainfall, dict):
        coverage["past_observations"]["district_rainfall"] = rainfall
        # Rebuild timeline so past day picks up district daily snapshot.
        coverage["window_days"] = build_window_timeline(
            window,
            forecast_days=list((coverage.get("forecast_window") or {}).get("days") or []),
            past=coverage["past_observations"],
        )

    rainfall_days = extract_rainfall_from_forecast_days(coverage.get("window_days") or [])
    if status_only:
        rainfall_days = []

    result: dict[str, Any] = {
        "success": True,
        "date_window": coverage.get("date_window") or window,
        "rainfall_focus": rainfall_focus,
        "rainfall_days": rainfall_days,
    }
    if coverage.get("past_observations"):
        result["past_observations"] = coverage["past_observations"]
    if coverage.get("forecast_window"):
        result["forecast_window"] = coverage["forecast_window"]
    if coverage.get("window_days"):
        result["window_days"] = coverage["window_days"]
    if coverage.get("coverage_note"):
        result["coverage_note"] = coverage["coverage_note"]

    # Compact daily stats only for today-status; date ranges use day timeline.
    if rainfall_focus == "daily":
        result["district_rainfall"] = rainfall
    elif window.get("includes_today") and rainfall_focus == "window":
        # Optional one-line context for ranges that include today — formatter
        # may show daily fields only, never weekly/monthly dump.
        result["district_rainfall"] = rainfall
        result["district_rainfall_compact"] = True

    if rainfall_focus not in ("daily", "window"):
        current = _fetch_imd(latitude, longitude, "current_aws")
        result["stations"] = resolve_stations_for_query(
            latitude,
            longitude,
            location_specified=loc_specified,
            primary_payload=current,
            radius_km=radius_km,
        )

    result["success"] = (
        bool(result.get("rainfall_days"))
        or bool(rainfall.get("success", True))
        or bool((result.get("past_observations") or {}).get("success"))
        or bool((result.get("stations") or {}).get("stations"))
    )
    return _envelope(
        tool="get_rainfall_monsoon",
        farmer_need="Rainfall & Monsoon Inquiries",
        kcc_cluster=2,
        latitude=latitude,
        longitude=longitude,
        location=_location_fields(None, district, state, None),
        payload=result,
        extra={"location_specified": loc_specified},
    )


# --------------------------------------------------------------------------
# 3) Weather Forecast & Climate Reports
# --------------------------------------------------------------------------

@mcp.tool()
def get_weather_forecast_report(
    latitude: float,
    longitude: float,
    city: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    block: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: Optional[int] = None,
    location_specified: Optional[bool] = None,
    radius_km: float = DEFAULT_STATION_RADIUS_KM,
) -> dict:
    """
    KCC cluster 3 — Weather Forecast & Climate Reports.

    Forecast / weather report for today, next N days, specific date, or interval.
    Missing from_date or to_date defaults the other side to today.
    """
    err = _validate_coords(latitude, longitude)
    if err:
        return {"success": False, "tool": "get_weather_forecast_report", "error": err}

    named = _has_named_place(city, district, state, block)
    loc_specified = named if location_specified is None else bool(location_specified)
    window = resolve_date_window(from_date=from_date, to_date=to_date, days=days)
    coverage = apply_date_window_coverage(latitude, longitude, window)

    past = coverage.get("past_observations")
    sliced = coverage.get("forecast_window") or {
        "success": True,
        "date_window": window,
        "days": [],
    }

    stations: dict[str, Any] = {"stations": []}
    if not window.get("past_only"):
        current = _fetch_imd(latitude, longitude, "current_aws")
        stations = resolve_stations_for_query(
            latitude,
            longitude,
            location_specified=loc_specified,
            primary_payload=current,
            radius_km=radius_km,
        )

    result = {
        "success": (
            bool(sliced.get("days"))
            or bool((past or {}).get("success"))
            or bool(coverage.get("window_days"))
        ),
        "forecast_window": sliced,
        "stations": stations,
        "date_window": coverage.get("date_window") or window,
        "window_days": coverage.get("window_days") or [],
    }
    if past:
        result["past_observations"] = past
        result["advisory_note"] = past.get("note") or coverage.get("coverage_note")
        if window.get("past_only") and not past.get("success"):
            result["unavailable_reason"] = "past_history_not_available"
    if coverage.get("coverage_note"):
        result["coverage_note"] = coverage["coverage_note"]

    return _envelope(
        tool="get_weather_forecast_report",
        farmer_need="Weather Forecast & Climate Reports",
        kcc_cluster=3,
        latitude=latitude,
        longitude=longitude,
        location=_location_fields(city, district, state, block),
        payload=result,
        extra={"location_specified": loc_specified},
    )


# --------------------------------------------------------------------------
# 4) Temperature & Climate Conditions
# --------------------------------------------------------------------------

@mcp.tool()
def get_temperature_climate(
    latitude: float,
    longitude: float,
    crop_name: Optional[str] = None,
    city: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: Optional[int] = None,
    nowcast: bool = False,
    location_specified: Optional[bool] = None,
    radius_km: float = DEFAULT_STATION_RADIUS_KM,
) -> dict:
    """
    KCC cluster 4 — Temperature & Climate Conditions.

    Temperature for today / next N days / date / interval, with optional nowcast
    short-interval block. Crop optima still belong in GDB/PoP.
    """
    err = _validate_coords(latitude, longitude)
    if err:
        return {"success": False, "tool": "get_temperature_climate", "error": err}

    named = _has_named_place(city, district, state)
    loc_specified = named if location_specified is None else bool(location_specified)
    window = resolve_date_window(from_date=from_date, to_date=to_date, days=days)

    current = _fetch_imd(latitude, longitude, "current_aws")
    coverage = apply_date_window_coverage(latitude, longitude, window)
    sliced = coverage.get("forecast_window") or {"days": []}
    stations = resolve_stations_for_query(
        latitude,
        longitude,
        location_specified=loc_specified,
        primary_payload=current,
        radius_km=radius_km,
    )

    result: dict[str, Any] = {
        "success": True,
        "current": current,
        "forecast_window": sliced,
        "temperature_days": extract_temperature_from_forecast_days(
            coverage.get("window_days") or sliced.get("days") or []
        ),
        "stations": stations,
        "date_window": coverage.get("date_window") or window,
        "window_days": coverage.get("window_days") or [],
    }
    if coverage.get("past_observations"):
        result["past_observations"] = coverage["past_observations"]
    if coverage.get("coverage_note"):
        result["coverage_note"] = coverage["coverage_note"]
    if nowcast:
        result["nowcast"] = build_nowcast_block(latitude, longitude, current)

    result["success"] = (
        bool(result["temperature_days"])
        or bool(current.get("success", True))
        or bool((result.get("past_observations") or {}).get("success"))
    )
    return _envelope(
        tool="get_temperature_climate",
        farmer_need="Temperature & Climate Conditions",
        kcc_cluster=4,
        latitude=latitude,
        longitude=longitude,
        location=_location_fields(city, district, state, None),
        payload=result,
        extra={
            "crop_name": crop_name,
            "location_specified": loc_specified,
            "advisory_note": (
                "Live temperature and forecast only. For crop-specific optimum "
                "temperature or cold-protection practices, combine with "
                "agricultural knowledge (GDB / Package of Practices)."
            ),
        },
    )


# --------------------------------------------------------------------------
# 5) Sowing Time & Planting Season
# --------------------------------------------------------------------------

@mcp.tool()
def get_sowing_season_weather(
    latitude: float,
    longitude: float,
    crop_name: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: Optional[int] = None,
    location_specified: Optional[bool] = None,
    radius_km: float = DEFAULT_STATION_RADIUS_KM,
) -> dict:
    """
    KCC cluster 5 — Sowing Time & Planting Season (weather context).

    Weather window for sowing decisions (dates + nearby stations). Does not
    replace PoP sowing calendars.
    """
    err = _validate_coords(latitude, longitude)
    if err:
        return {"success": False, "tool": "get_sowing_season_weather", "error": err}

    named = _has_named_place(None, district, state)
    loc_specified = named if location_specified is None else bool(location_specified)
    # Default sowing outlook: next 7 days when no dates given
    if from_date is None and to_date is None and days is None:
        days = 7
    window = resolve_date_window(from_date=from_date, to_date=to_date, days=days)

    current = _fetch_imd(latitude, longitude, "current_aws")
    coverage = apply_date_window_coverage(latitude, longitude, window)
    sliced = coverage.get("forecast_window") or {"days": []}
    stations = resolve_stations_for_query(
        latitude,
        longitude,
        location_specified=loc_specified,
        primary_payload=current,
        radius_km=radius_km,
    )

    result: dict[str, Any] = {
        "success": (
            bool(sliced.get("days"))
            or bool(current.get("success", True))
            or bool((coverage.get("past_observations") or {}).get("success"))
        ),
        "current": current,
        "forecast_window": sliced,
        "stations": stations,
        "date_window": coverage.get("date_window") or window,
        "window_days": coverage.get("window_days") or [],
    }
    if coverage.get("past_observations"):
        result["past_observations"] = coverage["past_observations"]
    if coverage.get("coverage_note"):
        result["coverage_note"] = coverage["coverage_note"]
    return _envelope(
        tool="get_sowing_season_weather",
        farmer_need="Sowing Time & Planting Season",
        kcc_cluster=5,
        latitude=latitude,
        longitude=longitude,
        location=_location_fields(None, district, state, None),
        payload=result,
        extra={
            "crop_name": crop_name,
            "location_specified": loc_specified,
            "advisory_note": (
                "Weather outlook for sowing decisions only. Recommended sowing "
                "windows, seed treatment, and fertilizer dose at sowing come from "
                "Package of Practices / knowledge base — not this tool."
            ),
        },
    )


# --------------------------------------------------------------------------
# 6) District-level weather condition queries
# --------------------------------------------------------------------------

@mcp.tool()
def get_district_weather(
    latitude: float,
    longitude: float,
    district: Optional[str] = None,
    state: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: Optional[int] = None,
    location_specified: Optional[bool] = None,
    radius_km: float = DEFAULT_STATION_RADIUS_KM,
) -> dict:
    """
    KCC cluster 6 — District-level weather condition queries.

    District warnings/rainfall plus dated forecast window and nearby stations.
    """
    err = _validate_coords(latitude, longitude)
    if err:
        return {"success": False, "tool": "get_district_weather", "error": err}

    named = _has_named_place(None, district, state)
    loc_specified = named if location_specified is None else bool(location_specified)
    window = resolve_date_window(from_date=from_date, to_date=to_date, days=days)

    district_payload = _fetch_imd(latitude, longitude, "district")
    current = _fetch_imd(latitude, longitude, "current_aws")
    coverage = apply_date_window_coverage(latitude, longitude, window)
    sliced = coverage.get("forecast_window") or {"days": []}
    stations = resolve_stations_for_query(
        latitude,
        longitude,
        location_specified=loc_specified,
        primary_payload=current,
        radius_km=radius_km,
    )

    result: dict[str, Any] = {
        "success": (
            bool(district_payload.get("success", True))
            or bool(sliced.get("days"))
            or bool(stations.get("stations"))
            or bool((coverage.get("past_observations") or {}).get("success"))
        ),
        "district": district_payload,
        "forecast_window": sliced,
        "stations": stations,
        "date_window": coverage.get("date_window") or window,
        "window_days": coverage.get("window_days") or [],
    }
    if coverage.get("past_observations"):
        result["past_observations"] = coverage["past_observations"]
    if coverage.get("coverage_note"):
        result["coverage_note"] = coverage["coverage_note"]
    return _envelope(
        tool="get_district_weather",
        farmer_need="District-level weather condition queries",
        kcc_cluster=6,
        latitude=latitude,
        longitude=longitude,
        location=_location_fields(None, district, state, None),
        payload=result,
        extra={"location_specified": loc_specified},
    )


# --------------------------------------------------------------------------
# 7) Nowcast — short-interval current + today outlook
# --------------------------------------------------------------------------

@mcp.tool()
def get_nowcast(
    latitude: float,
    longitude: float,
    city: Optional[str] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    location_specified: Optional[bool] = None,
    radius_km: float = DEFAULT_STATION_RADIUS_KM,
) -> dict:
    """
    Nowcast — short-interval weather outlook.

    Live AWS observation plus today's forecast only (not a multi-day report).
    Use for "right now", "next few hours", or short-term mausam questions.
    Includes nearby stations when location is missing or unmatched.
    """
    err = _validate_coords(latitude, longitude)
    if err:
        return {"success": False, "tool": "get_nowcast", "error": err}

    named = _has_named_place(city, district, state)
    loc_specified = named if location_specified is None else bool(location_specified)

    nowcast = build_nowcast_block(latitude, longitude)
    current = nowcast.get("current") if isinstance(nowcast.get("current"), dict) else {}
    stations = resolve_stations_for_query(
        latitude,
        longitude,
        location_specified=loc_specified,
        primary_payload=current,
        radius_km=radius_km,
    )

    result: dict[str, Any] = {
        "success": bool(nowcast.get("success")) or bool(stations.get("stations")),
        "nowcast": nowcast,
        "stations": stations,
    }
    return _envelope(
        tool="get_nowcast",
        farmer_need="Nowcast (short-interval outlook)",
        kcc_cluster=7,
        latitude=latitude,
        longitude=longitude,
        location=_location_fields(city, district, state, None),
        payload=result,
        extra={"location_specified": loc_specified},
    )


# --------------------------------------------------------------------------
# Entrypoint
# --------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="streamable-http")

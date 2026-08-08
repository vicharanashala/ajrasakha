# ajrasakha/tools/weather/weather_service.py
# Shared IMD weather service fetching data from IMD mirror APIs.

from __future__ import annotations

import logging
import math
import os
import re
import threading
import time
from difflib import get_close_matches
from typing import Any, Optional, Dict, List, Tuple

import requests

logger = logging.getLogger(__name__)

DEFAULT_CITY_BASE = os.getenv(
    "IMD_CITY_BASE", "http://100.100.108.101:18080/city/api"
).rstrip("/")
DEFAULT_MAUSAM_BASE = os.getenv(
    "IMD_MAUSAM_BASE", "http://100.100.108.101:18080/mausam/api"
).rstrip("/")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_UA = os.getenv("NOMINATIM_USER_AGENT", "IMD-Weather-Wrapper/1.0 (internal)")

STATE_NAME_TO_SID: dict[str, int] = {
    "TELANGANA": 1,
    "ANDHRA PRADESH": 2,
    "ANDHRA_PRADESH": 2,
    "HIMACHAL PRADESH": 3,
    "HIMACHAL_PRADESH": 3,
    "KERALA": 4,
    "UTTAR PRADESH": 5,
    "UTTAR_PRADESH": 5,
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
    "JAMMU_AND_KASHMIR": 18,
    "GOA": 19,
    "SIKKIM": 20,
    "MAHARASHTRA": 21,
    "HARYANA": 22,
    "LADAKH": 23,
    "ASSAM": 24,
    "TAMIL NADU": 25,
    "TAMIL_NADU": 25,
    "WEST BENGAL": 26,
    "WEST_BENGAL": 26,
    "MADHYA PRADESH": 27,
    "MADHYA_PRADESH": 27,
    "ARUNACHAL PRADESH": 28,
    "ARUNACHAL_PRADESH": 28,
    "LAKSHADWEEP": 29,
    "MANIPUR": 30,
    "UTTARAKHAND": 31,
    "NAGALAND": 32,
    "PUDUCHERRY": 33,
    "PONDICHERRY": 33,
    "PUNJAB": 34,
    "ANDAMAN AND NICOBAR ISLANDS": 35,
    "ANDAMAN_AND_NICOBAR": 35,
    "DAMAN AND DIU": 36,
    "DADRA AND NAGAR HAVELI AND DAMAN AND DIU": 36,
    "DADRA & NAGAR HAVELI": 36,
    "DAMAN_AND_DIU": 36,
}

ISO3166_IN_TO_SID: dict[str, int] = {
    "IN-AP": 2,
    "IN-AR": 28,
    "IN-AS": 24,
    "IN-BR": 11,
    "IN-CT": 12,
    "IN-GA": 19,
    "IN-GJ": 9,
    "IN-HR": 22,
    "IN-HP": 3,
    "IN-JH": 15,
    "IN-KA": 13,
    "IN-KL": 4,
    "IN-MP": 27,
    "IN-MH": 21,
    "IN-MN": 30,
    "IN-ML": 6,
    "IN-MZ": 14,
    "IN-NL": 32,
    "IN-OR": 10,
    "IN-PB": 34,
    "IN-RJ": 8,
    "IN-SK": 20,
    "IN-TN": 25,
    "IN-TG": 1,
    "IN-TR": 16,
    "IN-UP": 5,
    "IN-UT": 31,
    "IN-WB": 26,
    "IN-AN": 35,
    "IN-CH": 17,
    "IN-DD": 36,
    "IN-DN": 36,
    "IN-LD": 29,
    "IN-DL": 7,
    "IN-JK": 18,
    "IN-LA": 23,
    "IN-PY": 33,
}


def _norm_name(s: str | None) -> str:
    if not s:
        return ""
    s = s.upper().strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"^(DISTRICT|DIST\.?)\s+", "", s)
    return s


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _safe_float(x: Any) -> float | None:
    try:
        if x is None or x == "":
            return None
        return float(x)
    except (TypeError, ValueError):
        return None


class _TTLCache:
    def __init__(self, ttl_seconds: float):
        self.ttl = ttl_seconds
        self._lock = threading.Lock()
        self._data: Any = None
        self._exp: float = 0.0

    def get(self, loader):
        now = time.monotonic()
        with self._lock:
            if self._data is not None and now < self._exp:
                return self._data
        fresh = loader()
        with self._lock:
            self._data = fresh
            self._exp = time.monotonic() + self.ttl
        return fresh


class LatLonWeatherService:
    """Aggregates IMD mirror endpoints using coordinates & geocoding."""

    def __init__(
        self,
        city_base: str | None = None,
        mausam_base: str | None = None,
        timeout: float = 25.0,
        district_index_ttl: float = 3600.0,
    ):
        self.city_base = (city_base or DEFAULT_CITY_BASE).rstrip("/")
        self.mausam_base = (mausam_base or DEFAULT_MAUSAM_BASE).rstrip("/")
        self.timeout = timeout
        self._district_rows = _TTLCache(district_index_ttl)

    def _get_json(self, base: str, path: str, params: dict | None = None) -> Any:
        url = f"{base.rstrip('/')}/{path.lstrip('/')}"
        r = requests.get(url, params=params or {}, timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def reverse_geocode(self, lat: float, lon: float) -> dict[str, Any]:
        """OSM Nominatim reverse geocoding for location context with in-memory caching."""
        cache_key = f"{round(lat, 4)},{round(lon, 4)}"
        if not hasattr(self, "_reverse_geo_cache"):
            self._reverse_geo_cache = {}
        if cache_key in self._reverse_geo_cache:
            return self._reverse_geo_cache[cache_key]

        headers = {"User-Agent": NOMINATIM_UA}
        params = {"lat": lat, "lon": lon, "format": "json", "zoom": 10}
        fallback_res = {
            "display_name": f"Location ({lat:.2f}, {lon:.2f})",
            "state": None,
            "iso_3166_2": None,
            "district_guess": None,
            "country": "India",
            "raw_address": {},
        }
        try:
            r = requests.get(
                NOMINATIM_URL, params=params, headers=headers, timeout=self.timeout
            )
            if r.status_code == 200:
                data = r.json()
                addr = data.get("address") or {}
                district_guess = (
                    addr.get("state_district")
                    or addr.get("county")
                    or addr.get("city")
                    or addr.get("town")
                    or addr.get("village")
                    or addr.get("suburb")
                )
                res = {
                    "display_name": data.get("display_name"),
                    "state": addr.get("state"),
                    "iso_3166_2": addr.get("ISO3166-2-lvl4"),
                    "district_guess": district_guess,
                    "country": addr.get("country"),
                    "raw_address": addr,
                }
                self._reverse_geo_cache[cache_key] = res
                return res
        except Exception as ex:
            logger.warning("Reverse geocoding warning for (%s, %s): %s", lat, lon, ex)

        return fallback_res

    def forward_geocode(
        self,
        location: str | None = None,
        district: str | None = None,
        state: str | None = None,
    ) -> tuple[float | None, float | None, str | None]:
        """Geocode place name to (lat, lon, display_name) with in-memory caching."""
        loc_clean = location.strip() if location else None
        dist_clean = district.strip() if district else None
        state_clean = state.strip() if state else None

        alias_map = {
            "kottiyur": ("Kottiyoor", "Kannur"),
            "kottiyoor": ("Kottiyoor", "Kannur"),
            "moovatupuzha": ("Muvattupuzha", "Ernakulam"),
            "moovattupuzha": ("Muvattupuzha", "Ernakulam"),
            "muvattupuzha": ("Muvattupuzha", "Ernakulam"),
            "calicut": ("Kozhikode", "Kozhikode"),
            "trivandrum": ("Thiruvananthapuram", "Thiruvananthapuram"),
            "cochin": ("Kochi", "Ernakulam"),
            "kochi": ("Kochi", "Ernakulam"),
            "alleppey": ("Alappuzha", "Alappuzha"),
            "trichur": ("Thrissur", "Thrissur"),
            "palghat": ("Palakkad", "Palakkad"),
            "quilon": ("Kollam", "Kollam"),
            "cannanore": ("Kannur", "Kannur"),
            "tellicherry": ("Thalassery", "Kannur"),
            "thalassery": ("Thalassery", "Kannur"),
            "badagara": ("Vadakara", "Kozhikode"),
            "vadakara": ("Vadakara", "Kozhikode"),
            "palai": ("Pala", "Kottayam"),
            "pala": ("Pala", "Kottayam"),
            "kasargod": ("Kasaragod", "Kasaragod"),
            "kasaragod": ("Kasaragod", "Kasaragod"),
            "thrikkakara": ("Thrikkakara", "Ernakulam"),
            "kalamassery": ("Kalamassery", "Ernakulam"),
            "edappally": ("Edappally", "Ernakulam"),
            "edapally": ("Edappally", "Ernakulam"),
        }
        for name_val in (loc_clean, dist_clean):
            if name_val and name_val.lower() in alias_map:
                c_name, c_dist = alias_map[name_val.lower()]
                loc_clean = c_name
                if c_dist and not state_clean:
                    state_clean = "Kerala"

        parts = [p for p in [loc_clean, dist_clean, state_clean] if p]
        if not parts:
            return None, None, None
        q = ", ".join(parts) + ", India"
        cache_key = q.lower()
        if not hasattr(self, "_forward_geo_cache"):
            self._forward_geo_cache = {}
        if cache_key in self._forward_geo_cache:
            return self._forward_geo_cache[cache_key]

        headers = {"User-Agent": NOMINATIM_UA}
        params = {"q": q, "format": "json", "limit": 1}
        try:
            r = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )
            if r.status_code == 200:
                data = r.json()
                if data and isinstance(data, list) and len(data) > 0:
                    item = data[0]
                    res = (float(item["lat"]), float(item["lon"]), item.get("display_name"))
                    self._forward_geo_cache[cache_key] = res
                    return res
        except Exception as e:
            logger.warning("forward_geocode failed for %r: %s", q, e)

        # Fallback queries for spelling variations (yur <-> yoor, etc.)
        fallback_queries = []
        if loc_clean:
            if "yur" in loc_clean.lower():
                fallback_queries.append(f"{re.sub(r'yur', 'yoor', loc_clean, flags=re.I)}, {state_clean or 'Kerala'}, India")
            elif "yoor" in loc_clean.lower():
                fallback_queries.append(f"{re.sub(r'yoor', 'yur', loc_clean, flags=re.I)}, {state_clean or 'Kerala'}, India")
            fallback_queries.append(f"{loc_clean}, India")

        for fq in fallback_queries:
            try:
                r_fb = requests.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": fq, "format": "json", "limit": 1},
                    headers=headers,
                    timeout=self.timeout,
                )
                if r_fb.status_code == 200:
                    d_fb = r_fb.json()
                    if d_fb and isinstance(d_fb, list) and len(d_fb) > 0:
                        item_fb = d_fb[0]
                        res_fb = (float(item_fb["lat"]), float(item_fb["lon"]), item_fb.get("display_name"))
                        self._forward_geo_cache[cache_key] = res_fb
                        return res_fb
            except Exception:
                pass

        res_none = (None, None, None)
        self._forward_geo_cache[cache_key] = res_none
        return res_none

    def resolve_state_sid(self, state_name: str | None, raw_address: dict | None = None) -> int | None:
        if raw_address:
            iso = raw_address.get("ISO3166-2-lvl4")
            if isinstance(iso, str) and iso.upper() in ISO3166_IN_TO_SID:
                return ISO3166_IN_TO_SID[iso.upper()]
        if not state_name:
            return None
        key = _norm_name(state_name).replace(" ", "_")
        key2 = _norm_name(state_name)
        if key in STATE_NAME_TO_SID:
            return STATE_NAME_TO_SID[key]
        if key2 in STATE_NAME_TO_SID:
            return STATE_NAME_TO_SID[key2]
        spaced = key2.replace("_", " ")
        return STATE_NAME_TO_SID.get(spaced)

    def _load_district_rows(self) -> list[dict[str, Any]]:
        data = self._get_json(self.mausam_base, "districtwise_rainfall_api.php")
        if not isinstance(data, list):
            return []
        return data

    def get_district_rows_cached(self) -> list[dict[str, Any]]:
        return self._district_rows.get(self._load_district_rows)

    def resolve_district_obj_id(
        self,
        district_hint: str | None,
        state_name: str | None,
        geocode: dict[str, Any] | None = None,
    ) -> tuple[int | None, str | None]:
        if not district_hint and not geocode:
            return None, None
        rows = self.get_district_rows_cached()
        if not rows:
            return None, None

        hint = _norm_name(district_hint) if district_hint else None
        inferred_sid = None
        if geocode and isinstance(geocode.get("raw_address"), dict):
            inferred_sid = self.resolve_state_sid(
                geocode.get("state"), geocode["raw_address"]
            )
        sid_from_name = self.resolve_state_sid(state_name, None) if state_name else None
        effective_sid = inferred_sid if inferred_sid is not None else sid_from_name

        def state_match(row_state: str) -> bool:
            if effective_sid is None:
                if state_name:
                    return _norm_name(row_state) == _norm_name(state_name)
                return True
            rsid = self.resolve_state_sid(row_state, None)
            return rsid == effective_sid

        in_state = [r for r in rows if state_match(str(r.get("State", "")))]
        pool = in_state if in_state else rows

        by_district = {_norm_name(str(r.get("District", ""))): r for r in pool}

        # 1. Exact match on district_hint
        if hint and hint in by_district:
            r = by_district[hint]
            return int(str(r["OBJ_ID"])), str(r.get("District"))

        # 2. Check geocode administrative district candidates (e.g. county, state_district, district_guess)
        if geocode:
            raw_addr = geocode.get("raw_address") or {}
            geo_candidates = [
                raw_addr.get("state_district"),
                raw_addr.get("county"),
                raw_addr.get("district"),
                geocode.get("district_guess"),
            ]
            for cand in geo_candidates:
                if cand:
                    cand_norm = _norm_name(cand)
                    if cand_norm in by_district:
                        r = by_district[cand_norm]
                        return int(str(r["OBJ_ID"])), str(r.get("District"))

        # 3. High-threshold close match with length safety
        if hint:
            names = list(by_district.keys())
            matches = get_close_matches(hint, names, n=1, cutoff=0.82)
            if matches:
                matched_name = matches[0]
                if abs(len(hint) - len(matched_name)) <= 3:
                    r = by_district[matched_name]
                    return int(str(r["OBJ_ID"])), str(r.get("District"))

            # 4. Substring match ONLY if n in hint (e.g. "Kottayam" in "Kottayam District")
            for n, r in by_district.items():
                if n in hint or hint == n:
                    return int(str(r["OBJ_ID"])), str(r.get("District"))

        return None, None

    def pick_nearest_forecast_station(
        self, lat: float, lon: float, records: list[dict[str, Any]]
    ) -> dict[str, Any] | None:
        best: tuple[float, dict[str, Any]] | None = None
        for rec in records:
            slat = _safe_float(rec.get("Latitude"))
            slon = _safe_float(rec.get("Longitude"))
            if slat is None or slon is None:
                continue
            d = _haversine_km(lat, lon, slat, slon)
            if best is None or d < best[0]:
                best = (d, rec)
        if best:
            return best[1]
        return records[0] if records else None

    def get_forecast_bundle(self, lat: float, lon: float) -> dict[str, Any]:
        raw = self._get_json(
            self.city_base, "cityweather_loc.php", {"lat": lat, "lon": lon}
        )
        if not raw:
            return {"success": False, "error": "No weather station data for location"}
        records = raw if isinstance(raw, list) else [raw]
        station = self.pick_nearest_forecast_station(lat, lon, records)
        if not station:
            return {"success": False, "error": "Could not parse forecast records"}

        slat = _safe_float(station.get("Latitude"))
        slon = _safe_float(station.get("Longitude"))
        dist_km = (
            _haversine_km(lat, lon, slat, slon)
            if slat is not None and slon is not None
            else None
        )

        today = {
            "date": station.get("Date"),
            "station": station.get("Station_Name"),
            "station_code": station.get("Station_Code"),
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
            "distance_to_station_km": round(dist_km, 2) if dist_km is not None else None,
        }
        forecast_days = []
        for day in range(2, 8):
            forecast_days.append(
                {
                    "day": day,
                    "max_temp": station.get(f"Day_{day}_Max_Temp"),
                    "min_temp": station.get(f"Day_{day}_Min_temp"),
                    "forecast": station.get(f"Day_{day}_Forecast"),
                }
            )
        return {
            "success": True,
            "today": today,
            "forecast": forecast_days,
            "stations_returned": len(records),
        }

    def get_nearest_aws(
        self,
        lat: float,
        lon: float,
        state_name: str | None,
        raw_address: dict | None = None,
    ) -> dict[str, Any]:
        sid = self.resolve_state_sid(state_name or "", raw_address)
        if sid is None:
            return {
                "success": False,
                "error": "Could not map geocoded state to IMD AWS state id (sid)",
            }
        try:
            raw = self._get_json(self.city_base, "aws_data_api.php", {"sid": sid})
        except requests.RequestException as e:
            return {"success": False, "error": str(e)}

        stations = raw if isinstance(raw, list) else [raw] if raw else []
        if not stations:
            return {"success": False, "error": f"No AWS stations for sid={sid}"}

        best: tuple[float, dict[str, Any]] | None = None
        for s in stations:
            slat = _safe_float(s.get("Latitude"))
            slon = _safe_float(s.get("Longitude"))
            if slat is None or slon is None:
                continue
            d = _haversine_km(lat, lon, slat, slon)
            if best is None or d < best[0]:
                best = (d, s)
        if not best:
            return {"success": False, "error": "No stations with coordinates in AWS feed"}

        dkm, s = best
        return {
            "success": True,
            "imd_state_sid": sid,
            "distance_km": round(dkm, 2),
            "station": {
                "name": s.get("STATION"),
                "district": s.get("DISTRICT"),
                "state": s.get("STATE"),
                "call_sign": s.get("CALL_SIGN"),
                "date": s.get("DATE"),
                "time": s.get("TIME"),
                "temperature_c": s.get("CURR_TEMP"),
                "feel_like_c": s.get("Feel Like"),
                "humidity_pct": s.get("RH"),
                "wind_speed_kmph": s.get("WIND_SPEED"),
                "wind_direction_deg": s.get("WIND_DIRECTION"),
                "mslp": s.get("MSLP"),
                "weather_message": s.get("WEATHER_MESSAGE"),
                "latitude": s.get("Latitude"),
                "longitude": s.get("Longitude"),
            },
        }

    def get_nearby_aws_stations(
        self,
        lat: float,
        lon: float,
        state_name: str | None,
        raw_address: dict | None = None,
        max_radius_km: float = 50.0,
        limit: int = 5,
    ) -> dict[str, Any]:
        """Fetch up to N nearby AWS stations within radius (default 50km)."""
        sid = self.resolve_state_sid(state_name or "", raw_address)
        if sid is None:
            return {
                "success": False,
                "error": "Could not map geocoded state to IMD AWS state id (sid)",
            }
        try:
            raw = self._get_json(self.city_base, "aws_data_api.php", {"sid": sid})
        except requests.RequestException as e:
            return {"success": False, "error": str(e)}

        stations = raw if isinstance(raw, list) else [raw] if raw else []
        if not stations:
            return {"success": False, "error": f"No AWS stations for sid={sid}"}

        with_dist: list[tuple[float, dict[str, Any]]] = []
        for s in stations:
            slat = _safe_float(s.get("Latitude"))
            slon = _safe_float(s.get("Longitude"))
            if slat is None or slon is None:
                continue
            d = _haversine_km(lat, lon, slat, slon)
            with_dist.append((d, s))

        with_dist.sort(key=lambda x: x[0])
        within_radius = [x for x in with_dist if x[0] <= max_radius_km]
        selected = within_radius if within_radius else with_dist

        top_stations = []
        for dkm, s in selected[:limit]:
            top_stations.append({
                "name": s.get("STATION"),
                "district": s.get("DISTRICT"),
                "state": s.get("STATE"),
                "distance_km": round(dkm, 2),
                "date": s.get("DATE"),
                "time": s.get("TIME"),
                "temperature_c": s.get("CURR_TEMP"),
                "humidity_pct": s.get("RH"),
                "wind_speed_kmph": s.get("WIND_SPEED"),
                "weather_message": s.get("WEATHER_MESSAGE"),
                "latitude": s.get("Latitude"),
                "longitude": s.get("Longitude"),
            })

        return {
            "success": True,
            "total_returned": len(top_stations),
            "max_radius_km": max_radius_km,
            "nearby_stations": top_stations,
        }

    def get_district_nowcast(self, obj_id: int) -> dict[str, Any]:
        """Fetch IMD district-wise short-term nowcast (0-3 hours)."""
        try:
            data = self._get_json(
                self.mausam_base, "district_nowcast_api.php", {"id": obj_id}
            )
        except requests.RequestException:
            try:
                data = self._get_json(self.mausam_base, "district_nowcast_api.php")
            except requests.RequestException as e:
                return {"success": False, "error": str(e)}

        if not data:
            return {"success": False, "error": f"No nowcast data for district id={obj_id}"}

        records = data if isinstance(data, list) else [data]
        rec = None
        s_obj = str(obj_id)
        for r in records:
            if str(r.get("OBJ_ID") or r.get("id") or r.get("Obj_id")) == s_obj:
                rec = r
                break
        if not rec and records:
            rec = records[0]

        return {"success": True, "record": rec}

    def get_district_warnings_raw(self, obj_id: int) -> dict[str, Any]:
        try:
            data = self._get_json(
                self.mausam_base, "warnings_district_api.php", {"id": obj_id}
            )
        except requests.RequestException as e:
            return {"success": False, "error": str(e)}
        if not data:
            return {"success": False, "error": f"No warnings for district id={obj_id}"}
        rec = data[0] if isinstance(data, list) else data
        return {"success": True, "record": rec}

    def get_all_district_warnings_for_state(self, state_name: str) -> dict[str, Any]:
        """Fetch warning records for all districts in a given state."""
        rows = self.get_district_rows_cached()
        state_district_map = {}
        st_low = _norm_name(state_name) if state_name else ""
        for r in rows:
            r_state = _norm_name(r.get("State") or "")
            if r_state and (st_low in r_state or r_state in st_low):
                state_district_map[str(r.get("OBJ_ID"))] = r.get("District")

        try:
            raw = self._get_json(self.mausam_base, "warnings_district_api.php")
        except Exception as e:
            return {"success": False, "error": str(e)}

        records = raw if isinstance(raw, list) else [raw] if raw else []
        matched_records = []
        for rec in records:
            obj_id_str = str(rec.get("OBJ_ID") or rec.get("id") or rec.get("Obj_id") or "")
            dist_name = rec.get("District") or state_district_map.get(obj_id_str)
            if obj_id_str in state_district_map or (dist_name and any(_norm_name(dist_name) == _norm_name(state_district_map[k]) for k in state_district_map)):
                matched_records.append({
                    "district": dist_name or rec.get("District"),
                    "obj_id": obj_id_str,
                    "day1_warning_codes": rec.get("Day_1") or rec.get("day_1"),
                    "day1_color": rec.get("Day1_Color") or rec.get("day1_color"),
                    "full_record": rec
                })

        return {
            "success": True,
            "state": state_name,
            "total_districts": len(matched_records),
            "district_records": matched_records
        }

    def get_district_rainfall_raw(self, obj_id: int) -> dict[str, Any]:
        try:
            data = self._get_json(
                self.mausam_base, "districtwise_rainfall_api.php", {"id": obj_id}
            )
        except requests.RequestException as e:
            return {"success": False, "error": str(e)}
        if not data:
            return {"success": False, "error": f"No rainfall row for district id={obj_id}"}
        rec = data[0] if isinstance(data, list) else data
        return {"success": True, "record": rec}

    def get_subdivision_warnings(self) -> dict[str, Any]:
        try:
            data = self._get_json(self.mausam_base, "api_subDivisionWiseWarning.php")
        except requests.RequestException as e:
            return {"success": False, "error": str(e)}
        subdivisions = data if isinstance(data, list) else [data] if data else []
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

    def get_subdivision_rainfall_forecast(self) -> dict[str, Any]:
        try:
            data = self._get_json(self.mausam_base, "api_5d_subdivisional_rf.php")
        except requests.RequestException as e:
            return {"success": False, "error": str(e)}
        subdivisions = data if isinstance(data, list) else [data] if data else []
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

    def bundle(
        self,
        lat: float,
        lon: float,
        *,
        include_aws: bool = True,
        include_district: bool = True,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {
            "latitude": lat,
            "longitude": lon,
            "geocode": None,
            "forecast": None,
            "nearest_aws": None,
            "district": None,
        }
        try:
            geo = self.reverse_geocode(lat, lon)
            out["geocode"] = geo
        except Exception as e:
            logger.warning("reverse_geocode failed: %s", e)
            out["geocode"] = {"error": str(e)}

        try:
            out["forecast"] = self.get_forecast_bundle(lat, lon)
        except requests.RequestException as e:
            out["forecast"] = {"success": False, "error": str(e)}

        state_name = None
        raw_addr = None
        if isinstance(out["geocode"], dict):
            state_name = out["geocode"].get("state")
            raw_addr = out["geocode"].get("raw_address")

        if include_aws:
            try:
                out["nearest_aws"] = self.get_nearest_aws(
                    lat, lon, state_name, raw_addr
                )
            except Exception as e:
                out["nearest_aws"] = {"success": False, "error": str(e)}

        if include_district and isinstance(out["geocode"], dict):
            hint = out["geocode"].get("district_guess")
            try:
                obj_id, matched = self.resolve_district_obj_id(
                    hint, state_name, out["geocode"]
                )
                if obj_id is None:
                    out["district"] = {
                        "success": False,
                        "error": "Could not resolve IMD district OBJ_ID from geocoder hint",
                        "hint": hint,
                        "state": state_name,
                    }
                else:
                    w = self.get_district_warnings_raw(obj_id)
                    rf = self.get_district_rainfall_raw(obj_id)
                    out["district"] = {
                        "success": w["success"] and rf["success"],
                        "obj_id": obj_id,
                        "matched_district": matched,
                        "warnings": w,
                        "rainfall": rf,
                    }
            except Exception as e:
                out["district"] = {"success": False, "error": str(e)}

        return out

_service: LatLonWeatherService | None = None

def get_service() -> LatLonWeatherService:
    global _service
    if _service is None:
        _service = LatLonWeatherService()
    return _service

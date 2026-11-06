"""
Ajrasakha Live Weather API
==========================
Production-ready FastAPI service delivering real-time weather observations.

Data Source Priority:
  1. Annam Weather Station (WS Nearest Sensors) - prioritized for hyper-local live sensors
     (liveTemperature, humidity, rainfall, windSpeed) from the nearest station (no distance limit).
  2. India Meteorological Department (IMD) - prioritized for 'feelsLikeTemperature' and
     'weatherCondition', and acts as full fallback when Annam is out of range or unavailable.

Resiliency & Caching:
  - Hot Cache (In-Memory TTL): 5-minute cache per geographic grid cell to minimize latency and upstream load.
  - Persistent Fallback Cache: Saves every successful live update to disk. If both Annam and IMD
    are temporarily down, automatically serves the last known good update within radius.
  - Comprehensive Error Handling: Clean JSON errors, coordinate boundary validation, upstream timeouts.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import re
import socket
import threading
import time
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Load environment configuration
try:
    from dotenv import load_dotenv
    load_dotenv()
    _parents = Path(__file__).resolve().parents
    if len(_parents) > 2:
        load_dotenv(_parents[2] / ".env")
except ImportError:
    pass

# Logging Setup
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("live_weather_api")

# Configuration Constants
WS_BASE_URL = os.getenv(
    "WS_NEAREST_SENSORS_BASE_URL",
    "https://5mqwg03znl.execute-api.us-east-1.amazonaws.com",
).rstrip("/")
WS_NEARBY_PATH = "/nearby/WS_Nearest_Sensors"
WS_TIMEOUT_SECONDS = float(os.getenv("WS_TIMEOUT_SECONDS", "6.0"))
# Live data always comes from the NEAREST Annam / IMD station (no distance limit).
# Outage-only stale cache: only a cached reading taken within this radius of the request is reused.
STALE_FALLBACK_RADIUS_KM = 50.0
# Observations older than this are ignored (a dead sensor must not look "live").
ANNAM_MAX_OBS_AGE = timedelta(hours=6)
IMD_MAX_OBS_AGE = timedelta(hours=12)
# A stale-cache answer older than this is never served.
STALE_FALLBACK_MAX_AGE_SECONDS = 24 * 3600.0
PERSISTENT_CACHE_MAX_ENTRIES = 5000
CACHE_FLUSH_INTERVAL_SECONDS = 30.0
# After an upstream failure, skip that upstream for this long instead of making every request wait for the timeout.
UPSTREAM_RETRY_COOLDOWN_SECONDS = 30.0
# Plausibility ranges: a reading outside them is a sensor fault and is treated as missing.
TEMP_RANGE_C = (-50.0, 60.0)
HUMIDITY_RANGE = (0.0, 100.0)
WIND_RANGE_KMPH = (0.0, 200.0)
WIND_RANGE_MPS = (0.0, 55.0)
RAIN_RANGE_MM = (0.0, 1500.0)
FEELS_RANGE_C = (-70.0, 80.0)

IMD_CITY_BASE = os.getenv(
    "IMD_CITY_BASE",
    "http://100.100.108.101:18080/city/api",
).rstrip("/")
IMD_TIMEOUT_SECONDS = float(os.getenv("IMD_TIMEOUT_SECONDS", "6.0"))

WEATHER_CACHE_TTL_SECONDS = float(os.getenv("WEATHER_CACHE_TTL_SECONDS", "300.0"))  # 5 min
CACHE_DIR = Path(os.getenv("WEATHER_CACHE_DIR", str(Path(__file__).resolve().parent / "cache")))
CACHE_FILE = CACHE_DIR / "weather_cache.json"
# Bundled IMD station coordinates (station id -> [lat, lon, name]). The live IMD directory (cityweather_loc.php) is
# missing a few hundred stations that DO appear in the current-weather feed (e.g. Goalpara 42407); without
# coordinates such a station can never be chosen as "nearest", so this file fills the gaps.
STATION_COORDS_FILE = Path(__file__).resolve().parent / "data" / "imd_station_coords.json"

# In-memory IMD station location cache TTL (coordinates rarely change)
IMD_LOC_CACHE_TTL = 3600.0  # 1 hour
FORECAST_CACHE_TTL_SECONDS = float(os.getenv("FORECAST_CACHE_TTL_SECONDS", "3600.0"))  # 1 hour
FORECAST_STALE_MAX_SECONDS = float(os.getenv("FORECAST_STALE_MAX_SECONDS", str(48 * 3600)))
IMD_WX_CACHE_TTL = 60.0    # 1 minute

# -----------------------------------------------------------------------------
# Data Models
# -----------------------------------------------------------------------------
class LiveWeatherResponse(BaseModel):
    """
    Standard live weather response format.
    Returns weather data plus station metadata and source attribution.
    """
    liveTemperature: float = Field(..., description="Current temperature in Celsius")
    humidity: float = Field(..., description="Relative humidity percentage (0-100)")
    rainfall: float = Field(..., description="Rainfall in millimeters")
    windSpeed: float = Field(..., description="Wind speed in km/h")
    weatherCondition: str = Field(..., description="Current weather condition description")
    feelsLikeTemperature: float = Field(..., description="Apparent / feels-like temperature in Celsius")
    source: str = Field(..., description="Data source: 'aws', 'imd', or 'aws+imd'")
    station_name: Optional[str] = Field(None, description="Name or identifier of the nearest station")
    station_distance_km: Optional[float] = Field(None, description="Great-circle distance to station in kilometers")
    recorded_at: Optional[str] = Field(None, description="Observation time in IST (e.g. 04 Nov 2026, 01:02 PM IST)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "liveTemperature": 32.5,
                "humidity": 65.0,
                "rainfall": 0.0,
                "windSpeed": 12.4,
                "weatherCondition": "Partly Cloudy",
                "feelsLikeTemperature": 35.2,
                "source": "aws+imd",
                "station_name": "Rup Nagar tehsil (Annam AWS: #ANNAM_CP02)",
                "station_distance_km": 0.64,
                "recorded_at": "04 Nov 2026, 01:02 PM IST",
            }
        }
    }


class ForecastDay(BaseModel):
    date: str = Field(..., description="Forecast date (YYYY-MM-DD, IST)")
    day: str = Field(..., description="Weekday short name, e.g. 'Fri'")
    dayIndex: int = Field(..., description="0 = first forecast day (today), up to 6")
    minTemperature: Optional[float] = Field(None, description="Forecast minimum temperature in Celsius")
    maxTemperature: Optional[float] = Field(None, description="Forecast maximum temperature in Celsius")
    weatherCondition: Optional[str] = Field(None, description="IMD forecast text for the day")
    conditionCode: str = Field(..., description="Normalized condition: clear, partly_cloudy, cloudy, haze, fog, rain, thunderstorm, duststorm, snow, windy, hot, heat_wave, cold_wave, unknown")
    rainPossible: bool = Field(..., description="True if the IMD text mentions rain, drizzle, showers or thunder")
    sunrise: Optional[str] = Field(None, description="Sunrise time HH:MM (IST)")
    sunset: Optional[str] = Field(None, description="Sunset time HH:MM (IST)")


class ForecastResponse(BaseModel):
    source: str = Field("imd")
    station_name: Optional[str] = None
    station_distance_km: Optional[float] = None
    issued_for: Optional[str] = Field(None, description="Date of the first forecast day (YYYY-MM-DD)")
    days_available: int = Field(..., description="Number of forecast days returned (IMD gives 6-7)")
    is_cached: bool = False
    warnings: List[str] = Field(default_factory=list)
    forecast: List[ForecastDay]


class ErrorResponse(BaseModel):
    status: str = Field("error")
    message: str = Field(..., description="Error message description")
    detail: Optional[Any] = None


# -----------------------------------------------------------------------------
# Math & Meteorology Utility Functions
# -----------------------------------------------------------------------------
_IST = timezone(timedelta(hours=5, minutes=30))


def parse_observation_timestamp(
    annam_result: Optional[Dict[str, Any]],
    imd_result: Optional[Dict[str, Any]],
) -> str:
    """
    Extract and parse the actual observation timestamp from the upstream sensor/API
    into 'DD Mon YYYY, hh:mm AM/PM IST'.
    1. If Annam WS is available: parse its 'TimeStamp' (e.g. '2026-11-05 13:10:00', recorded in IST).
    2. Else if IMD is available: parse 'Date of Observation' + 'Time' (UTC hour) -> convert to IST.
    3. Fallback: current time in IST.
    """
    # 1. Annam Weather Station
    if annam_result:
        raw_ts = annam_result.get("TimeStamp") or annam_result.get("timestamp") or annam_result.get("created_at")
        if raw_ts:
            try:
                # Annam timestamps are typically 'YYYY-MM-DD HH:MM:SS' in local IST
                dt = datetime.strptime(str(raw_ts).strip(), "%Y-%m-%d %H:%M:%S")
                dt = dt.replace(tzinfo=_IST)
                return dt.strftime("%d %b %Y, %I:%M %p IST")
            except Exception:
                try:
                    dt = datetime.fromisoformat(str(raw_ts).strip())
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=_IST)
                    else:
                        dt = dt.astimezone(_IST)
                    return dt.strftime("%d %b %Y, %I:%M %p IST")
                except Exception:
                    pass

    # 2. IMD API
    if imd_result:
        raw_imd = imd_result.get("raw") or {}
        obs_date = raw_imd.get("Date of Observation")
        obs_time = raw_imd.get("Time")
        if obs_date and obs_time is not None:
            try:
                hour = int(obs_time)
                dt_utc = datetime.strptime(f"{str(obs_date).strip()} {hour:02d}:00:00", "%Y-%m-%d %H:%M:%S")
                dt_utc = dt_utc.replace(tzinfo=timezone.utc)
                dt_ist = dt_utc.astimezone(_IST)
                return dt_ist.strftime("%d %b %Y, %I:%M %p IST")
            except Exception:
                pass

    # 3. Fallback to current time
    now_ist = datetime.now(timezone.utc).astimezone(_IST)
    return now_ist.strftime("%d %b %Y, %I:%M %p IST")


def _annam_obs_too_old(station: Dict[str, Any]) -> bool:
    """True if the Annam sensor's own timestamp (IST) is older than ANNAM_MAX_OBS_AGE. Unparseable -> keep."""
    raw_ts = station.get("TimeStamp") or station.get("timestamp") or station.get("created_at")
    if not raw_ts:
        return False
    try:
        dt = datetime.strptime(str(raw_ts).strip(), "%Y-%m-%d %H:%M:%S").replace(tzinfo=_IST)
    except Exception:
        return False
    return datetime.now(timezone.utc) - dt > ANNAM_MAX_OBS_AGE


def _imd_obs_too_old(row: Dict[str, Any]) -> bool:
    """True if the IMD row (Date of Observation + UTC hour) is older than IMD_MAX_OBS_AGE. Unparseable -> keep."""
    try:
        dt = datetime.strptime(f"{str(row.get('Date of Observation')).strip()} {int(row.get('Time')):02d}:00:00",
                               "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except Exception:
        return False
    return datetime.now(timezone.utc) - dt > IMD_MAX_OBS_AGE


def format_readable_time(dt_val: Union[datetime, str, None]) -> Optional[str]:
    """Convert UTC ISO timestamp, IST formatted string, or datetime to 'DD Mon YYYY, hh:mm AM/PM IST'."""
    if not dt_val:
        return None
    try:
        if isinstance(dt_val, str):
            # If already formatted as '... IST', return as is
            if "IST" in dt_val:
                return dt_val
            dt = datetime.fromisoformat(dt_val)
        else:
            dt = dt_val
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt_ist = dt.astimezone(_IST)
        return dt_ist.strftime("%d %b %Y, %I:%M %p IST")
    except Exception:
        return str(dt_val)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two coordinates in kilometers."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def calculate_apparent_temperature(temp_c: float, humidity_pct: float, wind_speed_kmph: float = 0.0) -> float:
    """
    Calculate apparent 'feels like' temperature using the Australian Bureau of Meteorology formula
    (derived from Steadman's comprehensive human biometeorology studies):
        AT = Ta + 0.33 * e - 0.70 * ws - 4.00
    where:
        Ta = dry bulb temperature (°C)
        e  = water vapor pressure (hPa) = (RH / 100) * 6.105 * exp((17.27 * Ta) / (237.7 + Ta))
        ws = wind speed (m/s)
    """
    ws_mps = max(0.0, (wind_speed_kmph or 0.0) / 3.6)
    rh = max(0.0, min(100.0, humidity_pct))
    e = (rh / 100.0) * 6.105 * math.exp((17.27 * temp_c) / (237.7 + temp_c))
    at = temp_c + 0.33 * e - 0.70 * ws_mps - 4.00
    return round(at, 1)


def safe_float(val: Any) -> Optional[float]:
    """Safely convert any value to float, handling nulls and invalid strings."""
    if val is None or val == "" or val == "null":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def plausible(val: Any, lo: float, hi: float) -> Optional[float]:
    """safe_float() that also rejects NaN/inf and values outside [lo, hi] (sensor fault codes such as 999)."""
    f = safe_float(val)
    if f is None or f != f or not (lo <= f <= hi):
        return None
    return f


def etag_matches(header: Optional[str], etag: str) -> bool:
    """RFC 7232 If-None-Match: supports '*', comma-separated lists and weak validators (W/...)."""
    if not header:
        return False
    h = header.strip()
    if h == "*":
        return True
    opaque = etag.strip().removeprefix("W/")
    return any(part.strip().removeprefix("W/") == opaque for part in h.split(","))


# -----------------------------------------------------------------------------
# Caching System: Hot In-Memory TTL + Persistent Last-Known-Good Disk Cache
# -----------------------------------------------------------------------------
class WeatherCacheManager:
    """
    Thread-safe dual-layer cache manager:
      Layer 1: Hot In-Memory TTL cache (key = grid cell coordinate ~1.1km).
      Layer 2: Persistent Fallback Cache (stored on disk). Used when external
               APIs are offline. Finds exact or geographically closest observation.
    """
    def __init__(self, cache_file: Path, ttl_seconds: float = 300.0):
        self.cache_file = cache_file
        self.ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        
        # Hot cache: (rounded_lat, rounded_lon) -> (timestamp_monotonic, data_dict)
        self._hot_cache: Dict[Tuple[float, float], Tuple[float, Dict[str, Any]]] = {}
        
        # Persistent cache: list of records with {lat, lon, data, timestamp_iso, timestamp_epoch, station}
        self._persistent_cache: Dict[Tuple[float, float], Dict[str, Any]] = {}
        
        # Diagnostics
        self.stats = {
            "hot_hits": 0,
            "hot_misses": 0,
            "fallback_hits": 0,
            "writes": 0,
        }
        self._dirty = False
        self._last_flush = 0.0

        self._load_from_disk()

    @staticmethod
    def _grid_key(lat: float, lon: float) -> Tuple[float, float]:
        """Round coordinates to 2 decimal places (~1.1 km grid resolution)."""
        return round(lat, 2), round(lon, 2)

    def _load_from_disk(self) -> None:
        if not self.cache_file.exists():
            return
        try:
            with open(self.cache_file, "r", encoding="utf-8") as f:
                raw = json.load(f)
                if isinstance(raw, dict):
                    for k_str, val in raw.items():
                        parts = k_str.split(",")
                        if len(parts) == 2:
                            try:
                                key = (float(parts[0]), float(parts[1]))
                            except ValueError:
                                continue
                            # Ignore malformed records instead of crashing later on lookup
                            if (
                                isinstance(val, dict)
                                and isinstance(val.get("data"), dict)
                                and isinstance(val.get("timestamp_epoch"), (int, float))
                                and isinstance(val.get("timestamp_iso"), str)
                            ):
                                self._persistent_cache[key] = val
            logger.info("Loaded %d cached observations from %s", len(self._persistent_cache), self.cache_file)
        except Exception as exc:
            logger.warning("Failed to load persistent cache from %s: %s", self.cache_file, exc)

    def _save_to_disk(self) -> None:
        try:
            self.cache_file.parent.mkdir(parents=True, exist_ok=True)
            export_data = {
                f"{k[0]},{k[1]}": v for k, v in self._persistent_cache.items()
            }
            tmp_file = self.cache_file.with_suffix(".tmp")
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(export_data, f, indent=2)
            tmp_file.replace(self.cache_file)
        except Exception as exc:
            logger.warning("Failed to save persistent cache to disk: %s", exc)

    def get_hot(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """Retrieve from hot in-memory cache if not expired."""
        key = self._grid_key(lat, lon)
        now_mono = time.monotonic()
        with self._lock:
            entry = self._hot_cache.get(key)
            if entry:
                cached_time, data = entry
                if now_mono - cached_time < self.ttl_seconds:
                    self.stats["hot_hits"] += 1
                    data_copy = dict(data)
                    data_copy["_cache_age_seconds"] = round(now_mono - cached_time, 1)
                    data_copy["_cache_type"] = "hot_ttl"
                    return data_copy
            self.stats["hot_misses"] += 1
        return None

    def put(self, lat: float, lon: float, weather_data: Dict[str, Any]) -> None:
        """Store observation in both hot and persistent caches."""
        key = self._grid_key(lat, lon)
        now_mono = time.monotonic()
        now_epoch = time.time()
        now_iso = datetime.now(timezone.utc).isoformat()

        record = {
            "lat": lat,
            "lon": lon,
            "data": weather_data,
            "timestamp_iso": now_iso,
            "timestamp_epoch": now_epoch,
        }

        with self._lock:
            # Update hot cache
            if len(self._hot_cache) > 2000:
                self._hot_cache.clear()
            self._hot_cache[key] = (now_mono, weather_data)

            # Update persistent cache
            self._persistent_cache[key] = record
            self.stats["writes"] += 1

            self._prune_locked(now_epoch)
            # Debounced disk write: rewriting the whole file on every request blocks all requests.
            self._dirty = True
            if now_mono - self._last_flush >= CACHE_FLUSH_INTERVAL_SECONDS:
                self._flush_locked()

    def _prune_locked(self, now_epoch: float) -> None:
        """Drop records too old to ever be served and cap the total size (lock must be held)."""
        cutoff = now_epoch - STALE_FALLBACK_MAX_AGE_SECONDS
        for k in [k for k, r in self._persistent_cache.items() if r.get("timestamp_epoch", 0) < cutoff]:
            del self._persistent_cache[k]
        excess = len(self._persistent_cache) - PERSISTENT_CACHE_MAX_ENTRIES
        if excess > 0:
            oldest = sorted(self._persistent_cache.items(), key=lambda kv: kv[1].get("timestamp_epoch", 0))[:excess]
            for k, _ in oldest:
                del self._persistent_cache[k]

    def _flush_locked(self) -> None:
        self._save_to_disk()
        self._dirty = False
        self._last_flush = time.monotonic()

    def flush(self) -> None:
        """Write pending changes to disk (called on shutdown)."""
        with self._lock:
            if self._dirty:
                self._flush_locked()

    def get_stale_fallback(self, lat: float, lon: float, max_radius_km: float = STALE_FALLBACK_RADIUS_KM) -> Optional[Dict[str, Any]]:
        """
        Look up the closest cached observation when external APIs are offline.
        Searches exact grid key first, then any record within max_radius_km.
        """
        key = self._grid_key(lat, lon)
        with self._lock:
            # 1. Exact grid hit
            rec = self._persistent_cache.get(key)
            if rec and time.time() - rec["timestamp_epoch"] <= STALE_FALLBACK_MAX_AGE_SECONDS:
                self.stats["fallback_hits"] += 1
                data = dict(rec["data"])
                age = round(time.time() - rec["timestamp_epoch"], 1)
                data["_cache_age_seconds"] = age
                data["_cache_type"] = "stale_fallback"
                data["_recorded_at"] = rec["timestamp_iso"]
                logger.warning("Upstream APIs down: Serving exact stale fallback cache for (%s, %s) [Age: %.1fs]", lat, lon, age)
                return data

            # 2. Nearest geographic neighbor in persistent cache
            best: Optional[Tuple[float, Dict[str, Any]]] = None
            for (clat, clon), rec in self._persistent_cache.items():
                if time.time() - rec["timestamp_epoch"] > STALE_FALLBACK_MAX_AGE_SECONDS:
                    continue
                dist = haversine_km(lat, lon, clat, clon)
                if dist <= max_radius_km:
                    if best is None or dist < best[0]:
                        best = (dist, rec)

            if best:
                dist, rec = best
                self.stats["fallback_hits"] += 1
                data = dict(rec["data"])
                age = round(time.time() - rec["timestamp_epoch"], 1)
                data["_cache_age_seconds"] = age
                data["_cache_type"] = "stale_fallback"
                data["_recorded_at"] = rec["timestamp_iso"]
                data["_fallback_distance_km"] = round(dist, 2)
                logger.warning(
                    "Upstream APIs down: Serving nearest stale fallback cache (%.2f km away) for (%s, %s) [Age: %.1fs]",
                    dist, lat, lon, age
                )
                return data

        return None

    def clear(self) -> None:
        with self._lock:
            self._hot_cache.clear()
            self.stats["hot_hits"] = 0
            self.stats["hot_misses"] = 0


cache_manager = WeatherCacheManager(CACHE_FILE, ttl_seconds=WEATHER_CACHE_TTL_SECONDS)


# -----------------------------------------------------------------------------
# Upstream Clients: Annam Weather Station & IMD
# -----------------------------------------------------------------------------
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Tailscale SOCKS5 Proxy Configuration (Mirrors writing_assistant/llm_client.py)
# When running inside a container (Cloud Run / Render) with userspace Tailscale,
# 100.x CGNAT addresses (e.g. IMD mirror at 100.100.108.101) must route via localhost:1055.
_TAILNET_SOCKS_PROXY = os.getenv("TAILNET_SOCKS_PROXY", "socks5h://localhost:1055")
_TAILNET_HOST_RE = re.compile(r"^100\.(\d+)\.")


def _is_tailnet_host(hostname: str) -> bool:
    """True if hostname is within the Tailscale CGNAT 100.64.0.0/10 range or .ts.net."""
    if hostname.endswith(".ts.net"):
        return True
    m = _TAILNET_HOST_RE.match(hostname)
    return bool(m) and 64 <= int(m.group(1)) <= 127


def _is_socks_proxy_active() -> bool:
    """Check if local Tailscale SOCKS5 proxy is listening on localhost:1055."""
    try:
        with socket.create_connection(("127.0.0.1", 1055), timeout=0.15):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def _get_proxies_for_url(url: str) -> Optional[Dict[str, str]]:
    """Return SOCKS5 proxy dict if target is on Tailnet and local proxy is running."""
    hostname = urlparse(url).hostname or ""
    if _is_tailnet_host(hostname) and _is_socks_proxy_active():
        return {"http": _TAILNET_SOCKS_PROXY, "https": _TAILNET_SOCKS_PROXY}
    return None


def _create_http_session(retries: int = 2) -> requests.Session:
    """Create a resilient requests session with automatic connection retries."""
    session = requests.Session()
    retry_strategy = Retry(
        total=retries,
        backoff_factor=0.3,
        status_forcelist=[502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=20, pool_maxsize=50)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

http_session = _create_http_session()


def _load_static_station_coords() -> Dict[str, Tuple[float, float, str]]:
    try:
        with open(STATION_COORDS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        out: Dict[str, Tuple[float, float, str]] = {}
        for sid, v in raw.items():
            lat_, lon_ = safe_float(v[0]), safe_float(v[1])
            if lat_ is not None and lon_ is not None:
                out[str(sid).strip()] = (lat_, lon_, str(v[2]).strip())
        return out
    except Exception as exc:
        logger.warning("Could not load bundled station coordinates from %s: %s", STATION_COORDS_FILE, exc)
        return {}


class WeatherClient:
    """Manages concurrent fetching and normalization from Annam WS and IMD."""
    
    def __init__(self):
        # monotonic time of the last upstream failure (used to tell "outage" from "no station nearby")
        self.annam_last_error: float = 0.0
        self.imd_last_error: float = 0.0
        # circuit breaker: do not call a failing upstream again until this monotonic time
        self._annam_retry_after: float = 0.0
        self._imd_coords_retry_after: float = 0.0
        self._imd_wx_retry_after: float = 0.0

        # Bundled coordinates: used for stations missing from the live directory, and when it is unreachable
        self._static_coords: Dict[str, Tuple[float, float, str]] = _load_static_station_coords()

        # Cached IMD station directory
        self._imd_coords_cache: Dict[str, Tuple[float, float, str]] = {}
        self._imd_coords_time: float = 0.0
        self._imd_coords_lock = threading.Lock()

        self._imd_wx_list_cache: List[Dict[str, Any]] = []
        self._imd_wx_list_time: float = 0.0
        self._imd_wx_lock = threading.Lock()

    def fetch_annam_ws(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """
        Fetch nearest Annam Weather Station sensor data.
        Returns the nearest station with a valid, fresh observation (no distance limit); None if there is none.
        """
        url = f"{WS_BASE_URL}{WS_NEARBY_PATH}"
        if time.monotonic() < self._annam_retry_after:
            return None  # recently failing: fail fast instead of waiting for another timeout
        try:
            resp = http_session.get(
                url,
                params={"lat": lat, "long": lon},
                headers={"Accept": "application/json"},
                timeout=WS_TIMEOUT_SECONDS,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("Annam WS API fetch failed for lat=%s lon=%s: %s", lat, lon, exc)
            self.annam_last_error = time.monotonic()
            http_status = getattr(getattr(exc, "response", None), "status_code", None)
            if not (http_status is not None and http_status < 500):  # a 4xx is about this request, not an outage
                self._annam_retry_after = time.monotonic() + UPSTREAM_RETRY_COOLDOWN_SECONDS
            return None

        if not isinstance(data, dict):
            return None

        nearby = data.get("nearby")
        if not isinstance(nearby, list) or not nearby:
            return None

        # Filter valid observations with temperature
        valid_candidates = []
        for s in nearby:
            if not isinstance(s, dict):
                continue
            temp = plausible(s.get("Temperature"), *TEMP_RANGE_C)
            slat = safe_float(s.get("Latitude"))
            slon = safe_float(s.get("Longitude"))
            if temp is not None and slat is not None and slon is not None and not _annam_obs_too_old(s):
                dist = haversine_km(lat, lon, slat, slon)
                s_copy = dict(s)
                s_copy["_calculated_dist_km"] = dist
                valid_candidates.append(s_copy)

        if not valid_candidates:
            return None

        valid_candidates.sort(key=lambda s: s["_calculated_dist_km"])
        return valid_candidates[0]  # nearest station with a valid, fresh observation

    def upstream_down(self) -> bool:
        """True while an upstream circuit breaker is open (distinguishes an outage from 'no station nearby')."""
        now = time.monotonic()
        return now < self._annam_retry_after or now < self._imd_coords_retry_after or now < self._imd_wx_retry_after

    def imd_loaded(self) -> bool:
        """True once the IMD station directory and current-weather list have been fetched at least once."""
        return bool((self._imd_coords_cache or self._static_coords) and self._imd_wx_list_cache)

    def _get_imd_station_coords(self, lat: float, lon: float) -> Dict[str, Tuple[float, float, str]]:
        """Fetch/cache station coordinates from cityweather_loc.php."""
        now = time.monotonic()
        with self._imd_coords_lock:
            if self._imd_coords_cache and now - self._imd_coords_time < IMD_LOC_CACHE_TTL:
                return self._imd_coords_cache
            if now < self._imd_coords_retry_after:
                return self._imd_coords_cache or self._static_coords

        url = f"{IMD_CITY_BASE}/cityweather_loc.php"
        coords_map = {}
        try:
            proxies = _get_proxies_for_url(url)
            resp = http_session.get(
                url,
                params={"lat": lat, "lon": lon},
                timeout=IMD_TIMEOUT_SECONDS,
                proxies=proxies,
            )
            resp.raise_for_status()
            fc_rows = resp.json()
            if isinstance(fc_rows, list):
                for r in fc_rows:
                    if not isinstance(r, dict):
                        continue
                    code = str(r.get("Station_Code") or "").strip()
                    slat = safe_float(r.get("Latitude"))
                    slon = safe_float(r.get("Longitude"))
                    name = str(r.get("Station_Name") or "").strip()
                    if code and slat is not None and slon is not None:
                        coords_map[code] = (slat, slon, name)
        except Exception as exc:
            logger.warning("IMD cityweather_loc fetch error: %s", exc)
            self.imd_last_error = time.monotonic()
            self._imd_coords_retry_after = time.monotonic() + UPSTREAM_RETRY_COOLDOWN_SECONDS

        with self._imd_coords_lock:
            if coords_map:
                # live directory wins; bundled list only fills stations the directory does not have
                self._imd_coords_cache = {**self._static_coords, **coords_map}
                self._imd_coords_time = now
            return self._imd_coords_cache or self._static_coords

    def _get_imd_wx_list(self) -> List[Dict[str, Any]]:
        """Fetch/cache the nationwide current weather list from current_wx_api.php."""
        now = time.monotonic()
        with self._imd_wx_lock:
            if self._imd_wx_list_cache and now - self._imd_wx_list_time < IMD_WX_CACHE_TTL:
                return self._imd_wx_list_cache
            if now < self._imd_wx_retry_after:
                return self._imd_wx_list_cache

        url = f"{IMD_CITY_BASE}/current_wx_api.php"
        rows: List[Dict[str, Any]] = []
        try:
            proxies = _get_proxies_for_url(url)
            resp = http_session.get(url, timeout=IMD_TIMEOUT_SECONDS, proxies=proxies)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                rows = [r for r in data if isinstance(r, dict)]
            elif isinstance(data, dict):
                rows = [data]
        except Exception as exc:
            logger.warning("IMD current_wx_api fetch error: %s", exc)
            self.imd_last_error = time.monotonic()
            self._imd_wx_retry_after = time.monotonic() + UPSTREAM_RETRY_COOLDOWN_SECONDS

        with self._imd_wx_lock:
            if rows:
                self._imd_wx_list_cache = rows
                self._imd_wx_list_time = now
            return self._imd_wx_list_cache or rows

    def fetch_imd_wx(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """
        Fetch nearest IMD weather observation from current_wx_api.php.
        Returns enriched dictionary with temperature, humidity, feels_like, wind, and weather condition.
        """
        coords_map = self._get_imd_station_coords(lat, lon)
        wx_rows = self._get_imd_wx_list()

        if not wx_rows or not coords_map:
            return None

        best: Optional[Tuple[float, Dict[str, Any], float, float, str]] = None
        for row in wx_rows:
            sid = str(row.get("Station Id") or row.get("Station_Id") or "").strip()
            if not sid or sid not in coords_map or _imd_obs_too_old(row):
                continue
            slat, slon, sname = coords_map[sid]
            dist = haversine_km(lat, lon, slat, slon)
            if best is None or dist < best[0]:
                best = (dist, row, slat, slon, sname)

        if not best:
            return None

        dist, row, slat, slon, sname = best
        station_id = str(row.get("Station Id") or row.get("Station_Id") or "").strip()

        # Extract normalized fields
        temp = plausible(row.get("Temperature"), *TEMP_RANGE_C)
        feels = plausible(row.get("Feel Like"), *FEELS_RANGE_C)
        hum = plausible(row.get("Humidity"), *HUMIDITY_RANGE)

        wind_kmph = plausible(
            row.get("Wind Speed KMPH") if row.get("Wind Speed KMPH") is not None else row.get("Wind Speed"),
            *WIND_RANGE_KMPH,
        )
        rain_24h = plausible(row.get("Last 24 hrs Rainfall"), *RAIN_RANGE_MM)
        condition = (
            str(row.get("WEATHER_MESSAGE") or "").strip()
            or str(row.get("Weather Condition") or "").strip()
            or "Clear"
        )
        station_name = str(row.get("Station") or sname or f"Station {station_id}").strip()

        return {
            "station_id": station_id,
            "station_name": station_name,
            "distance_km": round(dist, 2),
            "temperature_c": temp,
            "feel_like_c": feels,
            "humidity_pct": hum,
            "wind_speed_kmph": wind_kmph,
            "past_24hrs_rainfall_mm": rain_24h if rain_24h is not None else 0.0,
            "weather_condition": condition,
            "latitude": slat,
            "longitude": slon,
            "raw": row,
        }


weather_client = WeatherClient()


# -----------------------------------------------------------------------------
# Business Logic: Merging Priority + Fallback Resolution
# -----------------------------------------------------------------------------
def _source_result(future: Any, name: str, err_attr: str) -> Optional[Dict[str, Any]]:
    """One upstream crashing must not take the request down: treat it as 'no data' from that source."""
    try:
        return future.result()
    except Exception:
        logger.exception("%s source crashed; continuing without it", name)
        setattr(weather_client, err_attr, time.monotonic())
        return None


def _serve_hot(lat: float, lon: float) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
    """Serve from the hot cache if fresh. The cache cell is ~1.1 km wide, so the reported
    station distance is recomputed for each requesting point."""
    cached = cache_manager.get_hot(lat, lon)
    if not cached:
        return None
    cache_type = cached.pop("_cache_type", "hot_ttl")
    age = cached.pop("_cache_age_seconds", 0.0)
    # Strip internal cache fields if stored from older data
    cached.pop("is_cached", None)
    cached.pop("cache_type", None)
    cached.pop("cache_age_seconds", None)
    slat = cached.pop("_station_lat", None)
    slon = cached.pop("_station_lon", None)
    if slat is not None and slon is not None:
        cached["station_distance_km"] = round(haversine_km(lat, lon, slat, slon), 2)
    meta = {
        "source": cached.get("source", "cached"),
        "station_name": cached.get("station_name"),
        "station_distance_km": cached.get("station_distance_km"),
        "is_cached": True,
        "cache_type": cache_type,
        "cache_age_seconds": age,
        "recorded_at": cached.get("recorded_at"),
    }
    return cached, meta


def get_live_weather_sync(lat: float, lon: float) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Core orchestrator:
      1. Check Hot Cache.
      2. Concurrently fetch Annam WS and IMD.
      3. Priority: nearest Annam WS for live metrics + IMD for feels-like and condition.
      4. Fallback: IMD for all fields when Annam is absent.
      5. Offline Fallback: Stale persistent cache if both upstream APIs fail.
      6. Returns (response_payload, metadata).
    """
    # 1. Hot cache check
    hot = _serve_hot(lat, lon)
    if hot is not None:
        return hot

    # 2. Concurrently fetch Annam and IMD
    fetch_started = time.monotonic()
    with ThreadPoolExecutor(max_workers=2) as executor:
        f_annam = executor.submit(weather_client.fetch_annam_ws, lat, lon)
        f_imd = executor.submit(weather_client.fetch_imd_wx, lat, lon)
        annam_result = _source_result(f_annam, "Annam", "annam_last_error")
        imd_result = _source_result(f_imd, "IMD", "imd_last_error")

    # 3. Decision Matrix
    live_temp: Optional[float] = None
    humidity: Optional[float] = None
    rainfall: float = 0.0
    wind_speed: float = 0.0
    weather_condition: str = "Clear"
    feels_like: Optional[float] = None

    source_used: str = ""
    station_name: Optional[str] = None
    station_dist: Optional[float] = None
    station_lat: Optional[float] = None
    station_lon: Optional[float] = None

    if annam_result:
        # Priority 1: Annam Weather Station (IMD contributes the nearest IMD station)
        source_used = "aws+imd" if imd_result else "aws"
        live_temp = plausible(annam_result.get("Temperature"), *TEMP_RANGE_C)
        humidity = plausible(annam_result.get("Humidity"), *HUMIDITY_RANGE)
        if humidity is None and imd_result:
            humidity = imd_result.get("humidity_pct")  # sensor gap: fill from the nearby IMD station
        
        rf = plausible(annam_result.get("Rainfall"), *RAIN_RANGE_MM)
        rainfall = round(rf, 1) if rf is not None else 0.0

        # Annam reports wind speed in m/s -> convert to km/h (mps * 3.6)
        ws_mps = plausible(annam_result.get("WindSpeed"), *WIND_RANGE_MPS)
        if ws_mps is not None:
            wind_speed = round(ws_mps * 3.6, 1)
        elif imd_result and imd_result.get("wind_speed_kmph") is not None:
            wind_speed = imd_result["wind_speed_kmph"]  # faulty/missing sensor reading: use the nearby IMD station
        else:
            wind_speed = 0.0
        
        dev_id = annam_result.get("DeviceId") or annam_result.get("Annam_ID")
        city = annam_result.get("City") or annam_result.get("District") or "Annam Sensor"
        station_name = f"{city} (Annam AWS: #{dev_id})"
        station_dist = round(annam_result.get("_calculated_dist_km", 0.0), 2)
        station_lat = safe_float(annam_result.get("Latitude"))
        station_lon = safe_float(annam_result.get("Longitude"))

        # Requirement: "feels like should come from imd apis"
        if imd_result and imd_result.get("feel_like_c") is not None:
            feels_like = round(float(imd_result["feel_like_c"]), 1)
        
        # Weather condition from IMD
        if imd_result and imd_result.get("weather_condition"):
            weather_condition = imd_result["weather_condition"]
        elif rainfall > 0:
            weather_condition = "Rainy"

    elif imd_result:
        # Priority 2: IMD Fallback
        source_used = "imd"
        live_temp = imd_result.get("temperature_c")
        humidity = imd_result.get("humidity_pct")
        rainfall = imd_result.get("past_24hrs_rainfall_mm") or 0.0
        wind_speed = imd_result.get("wind_speed_kmph") or 0.0  # key can exist with a null value
        weather_condition = imd_result.get("weather_condition") or "Clear"
        feels_like = imd_result.get("feel_like_c")
        station_name = imd_result.get("station_name")
        station_dist = imd_result.get("distance_km")
        station_lat = imd_result.get("latitude")
        station_lon = imd_result.get("longitude")

    # If feels_like was still not provided by IMD (e.g. station omitted it), compute apparent temp
    if feels_like is None and live_temp is not None and humidity is not None:
        feels_like = calculate_apparent_temperature(live_temp, humidity, wind_speed)

    # 4. Handle Offline / Complete Failure via Stale Fallback Cache
    if live_temp is None or humidity is None:
        logger.warning("Upstream APIs returned no usable data for lat=%s lon=%s; checking persistent fallback cache", lat, lon)
        stale = cache_manager.get_stale_fallback(lat, lon)
        if stale:
            s_lat, s_lon = stale.pop("_station_lat", None), stale.pop("_station_lon", None)
            stale.pop("_fallback_distance_km", None)
            if s_lat is not None and s_lon is not None:
                stale["station_distance_km"] = round(haversine_km(lat, lon, s_lat, s_lon), 2)
        if stale:
            cache_type = stale.pop("_cache_type", "stale_fallback")
            age = stale.pop("_cache_age_seconds", 0.0)
            rec_at = stale.pop("_recorded_at", None)
            stale.pop("is_cached", None)
            stale.pop("cache_type", None)
            stale.pop("cache_age_seconds", None)
            meta = {
                "source": "stale_fallback",
                "station_name": stale.get("station_name"),
                "station_distance_km": stale.get("station_distance_km"),
                "is_cached": True,
                "cache_type": cache_type,
                "cache_age_seconds": age,
                "recorded_at": rec_at,
            }
            return stale, meta

        # No cache available either. Distinguish "no station has data" from "upstreams are down".
        upstream_failed = (
            weather_client.annam_last_error >= fetch_started
            or weather_client.imd_last_error >= fetch_started
            or weather_client.upstream_down()
        )
        if not upstream_failed and weather_client.imd_loaded():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No weather station with a recent observation was found for this location.",
            )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Live weather services are currently unreachable and no cached observation is available for this location.",
        )

    # Construct validated response payload
    payload = {
        "liveTemperature": round(live_temp, 1),
        "humidity": round(humidity, 1),
        "rainfall": round(rainfall, 1),
        "windSpeed": round(wind_speed, 1),
        "weatherCondition": weather_condition,
        "feelsLikeTemperature": round(feels_like, 1) if feels_like is not None else round(live_temp, 1),
    }

    # Extract actual recorded observation time from the source sensor/API
    recorded_at_str = parse_observation_timestamp(annam_result, imd_result)

    meta = {
        "source": source_used,
        "station_name": station_name,
        "station_distance_km": station_dist,
        "is_cached": False,
        "cache_type": None,
        "cache_age_seconds": 0.0,
        "recorded_at": recorded_at_str,
    }

    # Store in hot and persistent cache
    to_cache = {
        "liveTemperature": payload["liveTemperature"],
        "humidity": payload["humidity"],
        "rainfall": payload["rainfall"],
        "windSpeed": payload["windSpeed"],
        "weatherCondition": payload["weatherCondition"],
        "feelsLikeTemperature": payload["feelsLikeTemperature"],
        "source": source_used,
        "station_name": station_name,
        "station_distance_km": station_dist,
        "recorded_at": recorded_at_str,
        "_station_lat": station_lat,   # internal: used to recompute the distance per request; never sent to clients
        "_station_lon": station_lon,
    }
    cache_manager.put(lat, lon, to_cache)

    return payload, meta



# -----------------------------------------------------------------------------
# 7-Day Forecast (IMD city forecast with latitude & longitude: cityweather_loc.php)
# -----------------------------------------------------------------------------
_forecast_rows_cache: List[Dict[str, Any]] = []
_forecast_rows_time: float = 0.0
_forecast_rows_lock = threading.Lock()
_forecast_retry_after: float = 0.0

# last good parsed forecast per station, also used as stale fallback (see below)
# station_code -> (epoch, days, meta, station_lat, station_lon)
_forecast_result_cache: Dict[str, Tuple[float, List[Dict[str, Any]], Dict[str, Any], float, float]] = {}
_forecast_result_lock = threading.Lock()


def _fetch_imd_forecast_rows() -> Tuple[List[Dict[str, Any]], bool]:
    """Return (rows, fresh). Falls back to the last good copy when IMD is unreachable."""
    global _forecast_rows_cache, _forecast_rows_time, _forecast_retry_after
    now = time.monotonic()
    with _forecast_rows_lock:
        if _forecast_rows_cache and now - _forecast_rows_time < FORECAST_CACHE_TTL_SECONDS:
            return _forecast_rows_cache, True
        if now < _forecast_retry_after:
            return _forecast_rows_cache, False  # recently failing: fail fast

    url = f"{IMD_CITY_BASE}/cityweather_loc.php"
    rows: List[Dict[str, Any]] = []
    try:
        resp = http_session.get(url, timeout=IMD_TIMEOUT_SECONDS, proxies=_get_proxies_for_url(url))
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            rows = [r for r in data if isinstance(r, dict)]
    except Exception as exc:
        logger.warning("IMD forecast fetch error: %s", exc)
        with _forecast_rows_lock:
            _forecast_retry_after = time.monotonic() + UPSTREAM_RETRY_COOLDOWN_SECONDS

    with _forecast_rows_lock:
        if rows:
            _forecast_rows_cache = rows
            _forecast_rows_time = now
            return rows, True
        return _forecast_rows_cache, False


def classify_condition(text: Optional[str]) -> Tuple[str, bool]:
    """Map IMD forecast text to (conditionCode, rainPossible).

    'possibility of rain' keeps the sky-cover code (rain is only possible, not forecast); a definite
    precipitation phrase overrides it. Negations ("no rain") are not precipitation.
    """
    t = (text or "").lower()
    if not t.strip():
        return "unknown", False
    negated = bool(re.search(r"\b(no|nil|without)\s+(rain\w*|precipitation|thunder\w*|showers?|drizzle)", t))
    precip = [] if negated else [w for w in ("thunder", "rain", "drizzle", "shower") if w in t]
    rain_possible = bool(precip)
    uncertain = any(w in t for w in ("possibility", "possible", "likely", "may "))

    if "partly cloudy" in t:
        sky = "partly_cloudy"
    elif "cloud" in t or "overcast" in t:
        sky = "cloudy"
    elif "clear" in t or "sunny" in t:
        sky = "clear"
    else:
        sky = ""

    if "heat wave" in t or "severe heat" in t:
        return "heat_wave", rain_possible
    if "cold wave" in t or "cold day" in t:
        return "cold_wave", rain_possible
    if precip and not uncertain:
        if "thunderstorm" in t or ("thunder" in t and "rain" not in t):
            return "thunderstorm", True
        return "rain", True
    if "dust" in t and not uncertain:
        return "duststorm", rain_possible
    if "fog" in t:
        return (sky if (uncertain and sky) else "fog"), rain_possible
    if "haze" in t or "mist" in t:
        return (sky if (uncertain and sky) else "haze"), rain_possible
    if "snow" in t:
        return "snow", rain_possible
    if not sky:
        if re.search(r"\b(winds?|gusty|squall\w*)\b", t):
            return "windy", rain_possible
        if re.search(r"\bhot\b", t):
            return "hot", rain_possible
    return (sky or ("partly_cloudy" if precip else "unknown")), rain_possible


def _clean_temp(val: Any) -> Optional[float]:
    f = safe_float(val)
    if f is None or not (-60.0 <= f <= 60.0):  # drops sentinels such as 999 / -999
        return None
    return round(f, 1)


def parse_forecast_row(row: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Turn one IMD station row into up to 7 normalized forecast days."""
    warnings: List[str] = []
    today_ist = datetime.now(timezone.utc).astimezone(_IST).date()
    try:
        start = datetime.strptime(str(row.get("Date")).strip(), "%Y-%m-%d").date()
    except Exception:
        start = today_ist
        warnings.append("missing_issue_date")
    if start < today_ist:
        warnings.append("stale_upstream")

    days: List[Dict[str, Any]] = []
    for i in range(7):
        if i == 0:
            max_key, min_key, text_key = "Todays_Forecast_Max_Temp", "Todays_Forecast_Min_temp", "Todays_Forecast"
        else:
            max_key, min_key, text_key = f"Day_{i + 1}_Max_Temp", f"Day_{i + 1}_Min_temp", f"Day_{i + 1}_Forecast"
        mx = _clean_temp(row.get(max_key))
        mn = _clean_temp(row.get(min_key))
        text = str(row.get(text_key) or "").strip() or None
        if mn is not None and mx is not None and mn > mx:
            mn, mx = mx, mn
        code, rain = classify_condition(text)
        d = start + timedelta(days=i)
        days.append({
            "date": d.isoformat(),
            "day": d.strftime("%a"),
            "dayIndex": i,
            "minTemperature": mn,
            "maxTemperature": mx,
            "weatherCondition": text,
            "conditionCode": code,
            "rainPossible": rain,
            "sunrise": str(row.get("Sunrise_time") or "").strip() or None if i == 0 else None,
            "sunset": str(row.get("Sunset_time") or "").strip() or None if i == 0 else None,
            "_has_data": mn is not None or mx is not None or text is not None,
        })

    while days and not days[-1]["_has_data"]:  # IMD often omits day 7
        days.pop()
    for d in days:
        d.pop("_has_data")
    return days, warnings


def _drop_past_days(days: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove days before today (IST) and renumber dayIndex, so stale data never presents yesterday as today."""
    today = datetime.now(timezone.utc).astimezone(_IST).date().isoformat()
    kept = [dict(d) for d in days if d["date"] >= today]
    for i, d in enumerate(kept):
        d["dayIndex"] = i
    return kept


def get_forecast_sync(lat: float, lon: float) -> Dict[str, Any]:
    """Forecast from the nearest IMD station that has forecast data (no distance limit)."""
    rows, fresh = _fetch_imd_forecast_rows()

    candidates: List[Tuple[float, float, float, Dict[str, Any]]] = []
    for r in rows:
        slat, slon = safe_float(r.get("Latitude")), safe_float(r.get("Longitude"))
        if slat is None or slon is None or not r.get("Station_Code"):
            continue
        candidates.append((haversine_km(lat, lon, slat, slon), slat, slon, r))
    candidates.sort(key=lambda c: c[0])

    for dist, slat, slon, r in candidates:
        days, warnings = parse_forecast_row(r)
        days = _drop_past_days(days)
        if not days:
            continue  # no forecast values (or all in the past): try the next nearest station
        if len(days) < 7:
            warnings.append(f"partial_forecast:{len(days)}_of_7_days")
        if dist > 50:
            warnings.append("far_station")
        code = str(r.get("Station_Code")).strip()
        meta = {
            "station_name": str(r.get("Station_Name") or code).strip(),
            "station_distance_km": round(dist, 2),
            "issued_for": days[0]["date"],
        }
        stale = False
        if not fresh:
            stale = True
            warnings.append("served_from_stale_cache")
        with _forecast_result_lock:
            _forecast_result_cache[code] = (time.time(), days, meta, slat, slon)
        return {**meta, "days_available": len(days), "is_cached": stale, "warnings": warnings, "forecast": days}

    # IMD unreachable (or its rows unusable): serve the last good forecast of the nearest cached station, if recent.
    if not rows or not fresh:
        best: Optional[Tuple[float, List[Dict[str, Any]], Dict[str, Any]]] = None
        with _forecast_result_lock:
            for ts, days, meta, slat, slon in _forecast_result_cache.values():
                if time.time() - ts > FORECAST_STALE_MAX_SECONDS:
                    continue
                dist = haversine_km(lat, lon, slat, slon)
                if dist > STALE_FALLBACK_RADIUS_KM:
                    continue
                if best is None or dist < best[0]:
                    best = (dist, days, meta)
        if best:
            dist, days, meta = best
            days = _drop_past_days(days)
            if days:
                meta = {**meta, "station_distance_km": round(dist, 2), "issued_for": days[0]["date"]}
                return {**meta, "days_available": len(days), "is_cached": True,
                        "warnings": ["served_from_stale_cache"], "forecast": days}
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Forecast service is currently unreachable and no recent forecast is available.",
            )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No forecast station with data was found for this location.",
    )


# -----------------------------------------------------------------------------
# FastAPI Application & Endpoints
# -----------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Ajrasakha Live Weather API starting up...")
    yield
    cache_manager.flush()
    logger.info("Ajrasakha Live Weather API shutting down...")


app = FastAPI(
    title="Ajrasakha Live Weather API",
    description=(
        "Production-ready weather API providing real-time meteorological observations.\n\n"
        "- **Priority 1**: Annam Weather Station (hyper-local live sensors, nearest station)\n"
        "- **Priority 2**: India Meteorological Department (IMD) for Feels-Like & general fallback\n"
        "- **High Availability**: Hot in-memory cache + persistent fallback cache during outages"
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.monotonic()
    response = await call_next(request)
    process_time = time.monotonic() - start_time
    response.headers["X-Process-Time"] = f"{process_time:.3f}s"
    return response


# Exception Handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"status": "error", "message": "Invalid query parameters", "detail": exc.errors()},
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Registered for Starlette's base class so unknown routes (404) and wrong methods (405) use the same format.
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "error", "message": exc.detail},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server exception: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"status": "error", "message": "An internal server error occurred while processing the weather request."},
    )


# -----------------------------------------------------------------------------
# In-Flight Request Coalescing (Singleflight Pattern)
# Prevents 'thundering herd' when multiple website visitors request the same coordinates
# simultaneously before the cache is warm.
# -----------------------------------------------------------------------------
_inflight_locks: Dict[Tuple[float, float], asyncio.Lock] = {}
_inflight_master_lock = asyncio.Lock()


async def get_grid_lock(key: Tuple[float, float]) -> asyncio.Lock:
    async with _inflight_master_lock:
        if len(_inflight_locks) > 5000:  # bound memory: drop locks nobody is holding
            for k in [k for k, l in _inflight_locks.items() if not l.locked()]:
                del _inflight_locks[k]
        if key not in _inflight_locks:
            _inflight_locks[key] = asyncio.Lock()
        return _inflight_locks[key]


def _header_safe(value: Any) -> str:
    """HTTP headers are latin-1: replace anything else (station names can be non-ASCII) and strip newlines."""
    return str(value).encode("ascii", "replace").decode("ascii").replace("\r", " ").replace("\n", " ").strip()


def _diag_headers(meta: Dict[str, Any]) -> Dict[str, str]:
    headers = {
        "X-Weather-Source": _header_safe(meta.get("source", "unknown")),
        "X-Cache-Status": _header_safe(meta.get("cache_type") or "hot_ttl") if meta.get("is_cached") else "MISS",
    }
    if meta.get("station_name"):
        headers["X-Station-Name"] = _header_safe(meta["station_name"])
    if meta.get("station_distance_km") is not None:
        headers["X-Station-Distance-KM"] = str(meta["station_distance_km"])
    return headers


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@app.head("/weather-live", include_in_schema=False)  # HEAD works but is not listed in /docs
@app.get(
    "/weather-live",
    response_model=LiveWeatherResponse,
    tags=["Weather"],
    summary="Get live weather observation",
    description=(
        "Fetch real-time weather data for a location specified by latitude and longitude.\n\n"
        "**Coverage: India only.** `lat` must be 6.7–37.1 °N and `lon` "
        "must be 68.1167–97.4167 °E. Coordinates outside this box return `400`.\n\n"
        "Priority order:\n"
        "1. **Nearest Annam Weather Station (AWS)** for `liveTemperature`, `humidity`, `rainfall`, and `windSpeed`.\n"
        "2. **Nearest IMD station** for `feelsLikeTemperature` and `weatherCondition`.\n"
        "3. Full fallback to the nearest **IMD** station when no AWS station has a valid reading.\n"
        "4. Stale-while-revalidate fallback cache when upstream APIs are unreachable."
    ),
)
async def get_live_weather_endpoint(
    request: Request,
    lat: float = Query(
        ...,
        description="Latitude in decimal degrees. Only locations inside India are served: 6.7 to 37.1 (°N).",
        ge=-90.0,
        le=90.0,
        json_schema_extra={"minimum": 6.7, "maximum": 37.1, "example": 17.385},
    ),
    lon: float = Query(
        ...,
        description="Longitude in decimal degrees. Only locations inside India are served: 68.1167 to 97.4167 (°E).",
        json_schema_extra={"minimum": 68.1167, "maximum": 97.4167, "example": 78.4867},
    ),
):
    longitude = lon

    # Validate coordinates are within mainland India's bounding box
    # Latitude: 6.7°N to 37.1000°N, Longitude: 68.1167°E to 97.4167°E
    if not (6.7 <= lat <= 37.1000 and 68.1167 <= longitude <= 97.4167):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Coordinates are outside India. This API only serves weather data for locations within mainland India (lat: 6.7°–37.1°N, lon: 68.1167°–97.4167°E).",
        )

    grid_key = (round(lat, 2), round(longitude, 2))
    hot = _serve_hot(lat, longitude)  # cheap and in-memory: serve on the event loop, not a worker thread
    if hot is not None:
        payload, meta = hot
    else:
        lock = await get_grid_lock(grid_key)
        async with lock:
            payload, meta = await asyncio.to_thread(get_live_weather_sync, lat, longitude)

    # Clean legacy cache metadata fields if present
    for k in ("is_cached", "cache_type", "cache_age_seconds"):
        payload.pop(k, None)

    # Enrich payload with station metadata
    payload["source"] = meta.get("source", "unknown")
    payload["station_name"] = meta.get("station_name")
    payload["station_distance_km"] = meta.get("station_distance_km")
    payload["recorded_at"] = format_readable_time(meta.get("recorded_at"))

    # Compute ETag for cache revalidation
    content_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
    etag = f'"{hashlib.md5(content_bytes).hexdigest()}"'
    cache_control = f"public, max-age={int(WEATHER_CACHE_TTL_SECONDS)}, stale-while-revalidate=60"
    if meta.get("source") == "stale_fallback":
        cache_control = "no-cache"  # outage data must not be kept by browsers/CDNs once sensors recover

    diag = _diag_headers(meta)

    # Support conditional GET (304 Not Modified)
    if etag_matches(request.headers.get("if-none-match"), etag):
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": cache_control, **diag, "X-Cache-Status": "NOT_MODIFIED"},
        )

    response = JSONResponse(content=payload, headers=diag)
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = cache_control
    return response


@app.head("/weather-forecast", include_in_schema=False)  # HEAD works but is not listed in /docs
@app.get(
    "/weather-forecast",
    response_model=ForecastResponse,
    tags=["Weather"],
    summary="Get 7-day weather forecast",
    description=(
        "7-day forecast for a location, from the nearest India Meteorological Department (IMD) city station.\n\n"
        "**Coverage: India only.** `lat` must be 6.7–37.1 °N and `lon` 68.1167–97.4167 °E.\n\n"
        "Per day: minimum/maximum temperature, IMD forecast text, a normalized `conditionCode`, and `rainPossible`. "
        "Sunrise/sunset are given for the first day. IMD does not publish forecast rainfall amount, humidity or wind, "
        "so those fields are not returned. IMD often publishes 6 days instead of 7: check `days_available`."
    ),
)
async def get_forecast_endpoint(
    request: Request,
    lat: float = Query(
        ...,
        description="Latitude in decimal degrees. Only locations inside India are served: 6.7 to 37.1 (°N).",
        ge=-90.0,
        le=90.0,
        json_schema_extra={"minimum": 6.7, "maximum": 37.1, "example": 17.385},
    ),
    lon: float = Query(
        ...,
        description="Longitude in decimal degrees. Only locations inside India are served: 68.1167 to 97.4167 (°E).",
        json_schema_extra={"minimum": 68.1167, "maximum": 97.4167, "example": 78.4867},
    ),
):
    if not (6.7 <= lat <= 37.1000 and 68.1167 <= lon <= 97.4167):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Coordinates are outside India. This API only serves weather data for locations within mainland India (lat: 6.7°–37.1°N, lon: 68.1167°–97.4167°E).",
        )

    payload = await asyncio.to_thread(get_forecast_sync, lat, lon)
    payload["source"] = "imd"

    etag = f'"{hashlib.md5(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()}"'
    cache_control = f"public, max-age={int(FORECAST_CACHE_TTL_SECONDS)}, stale-while-revalidate=300"
    if etag_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag, "Cache-Control": cache_control})

    response = JSONResponse(content=payload)
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = cache_control
    return response


@app.head("/health", include_in_schema=False)  # HEAD works but is not listed in /docs
@app.get(
    "/health",
    tags=["Diagnostics"],
    summary="API Health & Diagnostics",
    description="Check service health, cache statistics, and upstream configuration.",
)
async def health_check():
    return {
        "status": "healthy",
        "service": "ajrasakha-live-weather-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cache": {
            "ttl_seconds": WEATHER_CACHE_TTL_SECONDS,
            "hot_cache_entries": len(cache_manager._hot_cache),
            "persistent_cache_entries": len(cache_manager._persistent_cache),
            "stats": cache_manager.stats,
        },
        "upstream": {
            "annam_ws_base": WS_BASE_URL,
            "imd_city_base": IMD_CITY_BASE,
        },
    }


@app.post(
    "/cache/clear",
    tags=["Diagnostics"],
    summary="Clear In-Memory Cache",
    description="Clears the in-memory hot cache for operational maintenance.",
)
async def clear_cache():
    cache_manager.clear()
    return {"status": "ok", "message": "In-memory weather cache cleared successfully."}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8085"))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port, reload=True)

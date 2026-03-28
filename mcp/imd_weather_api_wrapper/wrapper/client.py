# imd_api_wrapper/wrapper/client.py
# ─────────────────────────────────────────────────────────────
# IMD API Client
# Live mode: IP-whitelist authentication (no API key required).
# Set API_KEY if using bearer token auth instead.
# ─────────────────────────────────────────────────────────────

import time
import random
import json
import logging
from datetime import datetime
import requests

from .config import (
    ENDPOINTS,
    FRESHNESS_MINUTES,
    PRIORITY,
    FARMER_NEED,
)

logger = logging.getLogger("IMDClient")

# Toggle 
BASE_URL = "http://100.100.108.101:18080"
API_KEY  = ""  # Optional. Leave empty for IP-whitelist auth mode.
USE_MOCK = False


# Season helper (drives realistic mock values) 
def _season() -> str:
    m = datetime.now().month
    if m in [3, 4, 5]:   return "summer"
    if m in [6, 7, 8, 9]: return "monsoon"
    return "winter"

_RANGES = {
    "summer" : {"temp":(32,46), "humidity":(20,55), "wind":(5,25),  "rain":(0,5)},
    "monsoon": {"temp":(24,34), "humidity":(70,95), "wind":(15,45), "rain":(10,120)},
    "winter" : {"temp":(5,22),  "humidity":(40,75), "wind":(5,20),  "rain":(0,15)},
}

def _r(lo, hi): return round(random.uniform(lo, hi), 1)
def _now():     return datetime.now().strftime("%Y-%m-%d %H:%M")


# ── Mock response builders (one per endpoint) ─────────────────

def _mock_city_forecast(city: str, state: str = "") -> dict:
    s, R = _season(), _RANGES[_season()]
    return {
        "city"      : city,
        "state"     : state,
        "season"    : s,
        "issued_at" : _now(),
        "temp"      : _r(*R["temp"]),
        "humidity"  : _r(*R["humidity"]),
        "wind_speed": _r(*R["wind"]),
        "rain"      : _r(*R["rain"]),
        "forecast"  : [
            {
                "day"      : i + 1,
                "temp_max" : _r(R["temp"][0]+2, R["temp"][1]),
                "temp_min" : _r(R["temp"][0], R["temp"][1]-4),
                "rainfall" : _r(*R["rain"]),
                "wind"     : _r(*R["wind"]),
                "humidity" : _r(*R["humidity"]),
                "condition": random.choice(
                    ["Partly Cloudy","Sunny","Cloudy","Light Rain","Thunderstorm"]
                ),
            }
            for i in range(7)
        ],
    }


def _mock_district_forecast(district: str, state: str = "") -> dict:
    s, R = _season(), _RANGES[_season()]
    return {
        "district"  : district,
        "state"     : state,
        "season"    : s,
        "issued_at" : _now(),
        "temp"      : _r(*R["temp"]),
        "humidity"  : _r(*R["humidity"]),
        "wind_speed": _r(*R["wind"]),
        "rain"      : _r(*R["rain"]),
        "forecast"  : [
            {
                "day"      : i + 1,
                "temp_max" : _r(R["temp"][0]+2, R["temp"][1]),
                "temp_min" : _r(R["temp"][0], R["temp"][1]-4),
                "rainfall" : _r(*R["rain"]),
                "condition": random.choice(
                    ["Clear","Partly Cloudy","Cloudy","Light Rain","Heavy Rain"]
                ),
            }
            for i in range(7)
        ],
    }


def _mock_rainfall_forecast(district: str, state: str = "",
                            days: int = 5) -> dict:
    R = _RANGES[_season()]
    return {
        "district"  : district,
        "state"     : state,
        "issued_at" : _now(),
        "days"      : days,
        "cumulative_mm"  : _r(0, 500),
        "normal_mm"      : _r(50, 300),
        "departure_pct"  : _r(-40, 60),
        "status"         : random.choice(
            ["Normal","Excess","Deficient","Large Excess","Large Deficit"]
        ),
        "forecast"  : [
            {
                "day"        : i + 1,
                "rainfall_mm": _r(*R["rain"]),
                "probability": _r(10, 90),
                "intensity"  : random.choice(
                    ["No Rain","Light","Moderate","Heavy"]
                ),
            }
            for i in range(days)
        ],
    }


def _mock_current_weather(city: str, state: str = "") -> dict:
    R = _RANGES[_season()]
    return {
        "city"       : city,
        "state"      : state,
        "observed_at": _now(),
        "temp"       : _r(*R["temp"]),
        "humidity"   : _r(*R["humidity"]),
        "wind_speed" : _r(*R["wind"]),
        "wind_dir"   : random.choice(["N","NE","E","SE","S","SW","W","NW"]),
        "rain"       : _r(0, R["rain"][1] * 0.3),
        "pressure"   : _r(995, 1015),
        "visibility" : _r(4, 15),
        "condition"  : random.choice(
            ["Clear","Haze","Mist","Partly Cloudy","Overcast"]
        ),
    }


def _mock_nowcast(district: str, state: str = "") -> dict:
    R = _RANGES[_season()]
    return {
        "district"   : district,
        "state"      : state,
        "valid_upto" : _now(),
        "temp"       : _r(*R["temp"]),
        "humidity"   : _r(*R["humidity"]),
        "wind_speed" : _r(*R["wind"]),
        "rain"       : _r(0, R["rain"][1] * 0.5),
        "nowcast"    : random.choice([
            "No significant weather",
            "Light rain likely in next 3 hours",
            "Thunderstorm possible",
            "Haze/mist expected in morning",
            "Strong winds advisory",
        ]),
    }


_WARNING_POOL = [
    "Heavy Rainfall Warning",
    "Thunderstorm Alert",
    "Strong Wind Advisory",
    "Heatwave Warning",
    "Cold Wave Alert",
    "No Active Warning",
    "No Active Warning",
    "No Active Warning",
]

def _mock_agromet_advisory(district: str, state: str = "",
                           crop: str = "") -> dict:
    warning = random.choice(_WARNING_POOL)
    severity = (
        "Red"    if "Heavy" in warning or "Heatwave" in warning else
        "Orange" if "Thunderstorm" in warning or "Strong" in warning else
        "Yellow" if "Cold" in warning else
        "Green"
    )
    return {
        "district"   : district,
        "state"      : state,
        "crop"       : crop or "General",
        "issued_at"  : _now(),
        "valid_until": _now(),
        "alert_type" : warning,
        "severity"   : severity,
        "advisory"   : (
            "Avoid outdoor activity. Seek shelter immediately."
            if warning != "No Active Warning"
            else "No precautionary measures required."
        ),
        "crop_advisory": random.choice([
            "Postpone irrigation for 2 days.",
            "Apply fungicide to prevent disease spread.",
            "Harvest immediately before heavy rain.",
            "No special action required.",
            "Cover sensitive crops tonight.",
        ]),
    }


# Response normaliser 

def _normalise(raw: dict, endpoint_key: str) -> dict:
    """Converts raw response to a consistent schema."""
    return {
        "endpoint"          : endpoint_key,
        "farmer_need"       : FARMER_NEED[endpoint_key],
        "priority"          : PRIORITY[endpoint_key],
        "freshness_minutes" : FRESHNESS_MINUTES[endpoint_key],
        "temperature_c"     : raw.get("temp") or raw.get("temperature"),
        "rainfall_mm"       : raw.get("rain") or raw.get("rainfall"),
        "humidity_pct"      : raw.get("humidity") or raw.get("rh"),
        "wind_speed_kmh"    : raw.get("wind_speed") or raw.get("wind"),
        "alert_type"        : raw.get("alert_type") or raw.get("warning"),
        "condition"         : raw.get("condition"),
        "raw"               : raw,
    }


# ── Core fetch function ───────────────────────────────────────

def _fetch(endpoint_key: str, params: dict,
           timeout: int = 10, max_retries: int = 3) -> dict:
    """
    Routes to mock or live IMD API depending on USE_MOCK flag.
    """
    if USE_MOCK:
        logger.info("[MOCK] %s | params=%s", endpoint_key, params)
        mock_fn = {
            "city_forecast"    : _mock_city_forecast,
            "district_forecast": _mock_district_forecast,
            "rainfall_forecast": _mock_rainfall_forecast,
            "current_weather"  : _mock_current_weather,
            "nowcast"          : _mock_nowcast,
            "agromet_advisory" : _mock_agromet_advisory,
        }[endpoint_key]
        raw = mock_fn(**params)
        return _normalise(raw, endpoint_key)

    # LIVE MODE: IP-whitelist supported (no API key required).
    url = BASE_URL.rstrip("/") + ENDPOINTS[endpoint_key]
    headers = {"Authorization": f"Bearer {API_KEY}"} if API_KEY else {}
    last_err = None
    auth_mode = "bearer" if API_KEY else "ip-whitelist"
    logger.info("[LIVE] %s | url=%s | auth=%s", endpoint_key, url, auth_mode)

    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=timeout)
            if resp.status_code == 200:
                try:
                    json_data = resp.json()
                    logger.info("[LIVE OK] %s | status=200 | bytes=%d", endpoint_key, len(resp.content))
                    return _normalise(json_data, endpoint_key)
                except json.JSONDecodeError as je:
                    last_err = f"JSON decode error: {str(je)}"
                    logger.error("[LIVE ERROR] %s | JSON parse failed: %s", endpoint_key, last_err)

            if resp.status_code == 429:
                logger.warning("[LIVE RETRY] %s | rate limited (429), waiting 5s", endpoint_key)
                time.sleep(5)
                continue

            last_err = f"HTTP {resp.status_code}: {resp.text[:200]}"
            logger.error("[LIVE ERROR] %s | HTTP %d", endpoint_key, resp.status_code)
        except Exception as exc:
            last_err = str(exc)
            logger.error("[LIVE ERROR] %s | exception: %s", endpoint_key, last_err)

        if attempt < max_retries:
            time.sleep(attempt)

    raise RuntimeError(f"[{endpoint_key}] Failed: {last_err}")


# ── Public API class ──────────────────────────────────────────

class IMDClient:
    """
    Client for the 6 priority IMD weather endpoints identified
    from analysis of 15.5M KCC farmer weather queries.

    Endpoint coverage
    -----------------
    city_forecast     CRITICAL  13,706,092 queries  88.15%
    district_forecast HIGH       1,335,570 queries   8.59%
    rainfall_forecast MEDIUM       248,633 queries   1.60%
    current_weather   MEDIUM       180,855 queries   1.16%
    nowcast           LOW           57,084 queries   0.37%
    agromet_advisory  LOW           21,655 queries   0.14%
    """

    def __init__(self):
        mode = "MOCK" if USE_MOCK else "LIVE"
        logger.info("IMDClient initialised | mode=%s", mode)

    # CRITICAL

    def get_city_forecast(self, city: str, state: str = "") -> dict:
        """
        7-day city weather forecast.
        Covers General Weather Forecast need — 13,706,092 queries (88.15%).
        Freshness: every 6 hours.
        Clusters : 3,18,28,27,58,10,15,14,30,13,47
        """
        return _fetch("city_forecast", {"city": city, "state": state})

    # HIGH 

    def get_district_forecast(self, district: str, state: str = "") -> dict:
        """
        7-day district weather forecast.
        Covers District Weather Forecast need — 1,335,570 queries (8.59%).
        Freshness: every 6 hours.
        Clusters : 54,36,41,8,9,12,40,52,17,7,26,1,53,32,22,45,48,
                   56,0,6,33,37,50,31,39,21,25,46,55,49,44,57,34,38,43,16
        """
        return _fetch("district_forecast", {"district": district, "state": state})

    # MEDIUM

    def get_rainfall_forecast(self, district: str, state: str = "",
                               days: int = 5) -> dict:
        """
        District rainfall forecast (up to 5 days).
        Covers Rain Forecast need — 248,633 queries (1.60%).
        Freshness: every 3 hours.
        Clusters : 20, 2, 4, 42, 19
        """
        if not 1 <= days <= 5:
            raise ValueError("days must be between 1 and 5")
        return _fetch("rainfall_forecast",
                      {"district": district, "state": state, "days": days})

    def get_current_weather(self, city: str, state: str = "") -> dict:
        """
        Real-time current weather conditions.
        Covers Current Weather Condition need — 180,855 queries (1.16%).
        Freshness: real-time / hourly.
        Clusters : 35, 29, 11
        """
        return _fetch("current_weather", {"city": city, "state": state})

    # LOW

    def get_nowcast(self, district: str, state: str = "") -> dict:
        """
        Short-term nowcast (3-hour window).
        Covers Short Term Forecast need — 57,084 queries (0.37%).
        Freshness: every 3 hours.
        Clusters : 24, 23
        """
        return _fetch("nowcast", {"district": district, "state": state})

    def get_agromet_advisory(self, district: str, state: str = "",
                              crop: str = "") -> dict:
        """
        Agro-meteorological advisory with crop-specific guidance.
        Covers Weather Impact on Crops need — 21,655 queries (0.14%).
        Freshness: daily.
        Clusters : 5, 51
        """
        return _fetch("agromet_advisory",
                      {"district": district, "state": state, "crop": crop})

    # Convenience

    def get_full_profile(self, city: str, district: str,
                         state: str = "", crop: str = "") -> dict:
        """
        Calls all 6 endpoints and returns a combined dict.
        A failure on one endpoint is captured and does not
        block the remaining calls.
        """
        calls = [
            ("city_forecast",     self.get_city_forecast,
             {"city": city, "state": state}),
            ("district_forecast", self.get_district_forecast,
             {"district": district, "state": state}),
            ("rainfall_forecast", self.get_rainfall_forecast,
             {"district": district, "state": state, "days": 5}),
            ("current_weather",   self.get_current_weather,
             {"city": city, "state": state}),
            ("nowcast",           self.get_nowcast,
             {"district": district, "state": state}),
            ("agromet_advisory",  self.get_agromet_advisory,
             {"district": district, "state": state, "crop": crop}),
        ]
        results = {}
        for key, fn, kwargs in calls:
            try:
                results[key] = fn(**kwargs)
            except Exception as exc:
                results[key] = {"error": str(exc), "endpoint": key}
        return results
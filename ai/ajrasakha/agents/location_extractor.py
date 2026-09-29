"""
location_extractor.py
---------------------
Converts (district, subdistrict, state) place-name triplets into
(latitude, longitude) coordinates.

Priority chain:
  1. Google Geocoding API  — uses GEOCODE_APIKEY from .env
  2. OpenStreetMap Nominatim — free / no key required
  3. Hard-coded Indian state-centre coordinates — last-resort fallback

Usage example (async)::

    from ajrasakha.agents.location_extractor import get_lat_long

    lat, lng, resolved_name = await get_lat_long(
        district="Ernakulam",
        subdistrict="Aluva",
        state="Kerala",
    )

All three parameters are optional; pass what you have.
Returns (None, None, None) only if every strategy fails.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Google Geocoding API key
# ---------------------------------------------------------------------------
_GEOCODE_APIKEY: str = os.getenv("GEOCODE_APIKEY", "")
_GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

# ---------------------------------------------------------------------------
# Hard-coded state-centre fallback coordinates (mirrors weather_tools2.py)
# ---------------------------------------------------------------------------
_STATE_CENTER_COORDINATES: dict[str, tuple[float, float, str]] = {
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
    "goa": (15.2993, 74.1240, "Panaji, Goa (State Center)"),
    "himachal pradesh": (31.1048, 77.1734, "Shimla, Himachal Pradesh (State Center)"),
    "uttarakhand": (30.3165, 78.0322, "Dehradun, Uttarakhand (State Center)"),
    "jharkhand": (23.3441, 85.3096, "Ranchi, Jharkhand (State Center)"),
    "chhattisgarh": (21.2514, 81.6296, "Raipur, Chhattisgarh (State Center)"),
    "tripura": (23.8315, 91.2868, "Agartala, Tripura (State Center)"),
    "meghalaya": (25.5788, 91.8933, "Shillong, Meghalaya (State Center)"),
    "manipur": (24.8170, 93.9368, "Imphal, Manipur (State Center)"),
    "nagaland": (25.6751, 94.1086, "Kohima, Nagaland (State Center)"),
    "mizoram": (23.7271, 92.7176, "Aizawl, Mizoram (State Center)"),
    "sikkim": (27.3389, 88.6065, "Gangtok, Sikkim (State Center)"),
    "arunachal pradesh": (27.0844, 93.6053, "Itanagar, Arunachal Pradesh (State Center)"),
    "delhi": (28.6139, 77.2090, "New Delhi, Delhi (UT Center)"),
    "jammu and kashmir": (34.0837, 74.7973, "Srinagar, Jammu and Kashmir (UT Center)"),
    "jammu & kashmir": (34.0837, 74.7973, "Srinagar, Jammu and Kashmir (UT Center)"),
    "ladakh": (34.1526, 77.5771, "Leh, Ladakh (UT Center)"),
    "puducherry": (11.9416, 79.8083, "Puducherry (UT Center)"),
    "chandigarh": (30.7333, 76.7794, "Chandigarh (UT Center)"),
    "andaman and nicobar": (11.6234, 92.7265, "Port Blair, Andaman and Nicobar (UT Center)"),
    "andaman & nicobar": (11.6234, 92.7265, "Port Blair, Andaman and Nicobar (UT Center)"),
}

# Placeholder values that should be treated as "not provided"
_PLACEHOLDERS = frozenset({"all", "not specified", "unknown", "none", "null", ""})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _clean(value: Optional[str]) -> str:
    """Strip whitespace; return '' if None."""
    return (value or "").strip()


def _build_query_string(
    district: Optional[str],
    subdistrict: Optional[str],
    state: Optional[str],
) -> str:
    """Build a free-form geocoding query (most specific → least specific)."""
    parts: list[str] = []
    if _clean(subdistrict):
        parts.append(_clean(subdistrict).title())
    d = _clean(district)
    if d and d.lower() != _clean(subdistrict).lower():
        parts.append(d.title())
    if _clean(state):
        parts.append(_clean(state).title())
    parts.append("India")
    return ", ".join(parts)


# ---------------------------------------------------------------------------
# Strategy 1: Google Geocoding API
# ---------------------------------------------------------------------------

async def _google_geocode(
    query: str,
    *,
    timeout: float = 10.0,
) -> tuple[float, float, str] | tuple[None, None, None]:
    """Query Google Geocoding API. Returns (lat, lng, formatted_address) or (None, None, None)."""
    if not _GEOCODE_APIKEY:
        logger.debug("GEOCODE_APIKEY not set; skipping Google Geocoding.")
        return None, None, None

    params = {
        "address": query,
        "key": _GEOCODE_APIKEY,
        "region": "in",
        "components": "country:IN",
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(_GOOGLE_GEOCODE_URL, params=params, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()

        status = data.get("status")
        results = data.get("results") or []

        if status == "OK" and results:
            loc = results[0]["geometry"]["location"]
            lat = float(loc["lat"])
            lng = float(loc["lng"])
            formatted = results[0].get("formatted_address", query)
            logger.info(
                "Google Geocoding resolved %r -> lat=%s, lng=%s (%s)",
                query, lat, lng, formatted,
            )
            return lat, lng, formatted

        logger.warning(
            "Google Geocoding returned status=%r for query %r", status, query
        )
    except Exception as exc:
        logger.warning("Google Geocoding failed for %r: %s", query, exc)

    return None, None, None


# ---------------------------------------------------------------------------
# Strategy 2: OpenStreetMap Nominatim
# ---------------------------------------------------------------------------

async def _nominatim_geocode(
    query: str,
    *,
    state: Optional[str] = None,
    district: Optional[str] = None,
    timeout: float = 10.0,
) -> tuple[float, float, str] | tuple[None, None, None]:
    """Query Nominatim. Returns (lat, lng, display_name) or (None, None, None)."""
    headers = {"User-Agent": "AjraSakha-Agent/1.0 (agri-weather)"}

    # Free-form search first (best for taluka / mandal / block names)
    params_q = {"q": query, "format": "json", "limit": 1, "addressdetails": 1}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(_NOMINATIM_URL, params=params_q, headers=headers, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()

        if data and isinstance(data, list):
            item = data[0]
            lat = float(item["lat"])
            lng = float(item["lon"])
            display_name = item.get("display_name", query)
            logger.info("Nominatim free-form resolved %r -> lat=%s, lng=%s", query, lat, lng)
            return lat, lng, display_name
    except Exception as exc:
        logger.warning("Nominatim free-form lookup failed for %r: %s", query, exc)

    # Structured search fallback
    if state or district:
        params_struct: dict = {"country": "India", "format": "json", "limit": 1, "addressdetails": 1}
        if state:
            params_struct["state"] = state
        if district:
            params_struct["city"] = district
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(_NOMINATIM_URL, params=params_struct, headers=headers, timeout=timeout)
                resp.raise_for_status()
                data = resp.json()

            if data and isinstance(data, list):
                item = data[0]
                lat = float(item["lat"])
                lng = float(item["lon"])
                display_name = item.get("display_name", query)
                logger.info("Nominatim structured resolved %r -> lat=%s, lng=%s", query, lat, lng)
                return lat, lng, display_name
        except Exception as exc:
            logger.warning("Nominatim structured lookup failed for %r: %s", query, exc)

    return None, None, None


# ---------------------------------------------------------------------------
# Strategy 3: Hard-coded state-centre coordinates
# ---------------------------------------------------------------------------

def _state_center_fallback(
    state: Optional[str],
) -> tuple[float, float, str] | tuple[None, None, None]:
    """Return pre-defined state capital / major-city coordinates."""
    if not state:
        return None, None, None
    key = _clean(state).lower()
    entry = _STATE_CENTER_COORDINATES.get(key)
    if entry:
        lat, lng, name = entry
        logger.info("State-centre fallback for %r -> lat=%s, lng=%s (%s)", state, lat, lng, name)
        return lat, lng, name
    return None, None, None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_lat_long(
    *,
    district: Optional[str] = None,
    subdistrict: Optional[str] = None,
    state: Optional[str] = None,
    timeout: float = 10.0,
) -> tuple[float | None, float | None, str | None]:
    """Resolve location name triplet into (latitude, longitude, resolved_name).

    Tries three strategies in order:
      1. Google Geocoding API  (requires GEOCODE_APIKEY env var)
      2. OpenStreetMap Nominatim (free, no key)
      3. State-centre hard-coded coordinates

    Args:
        district:    District name from the planner.
        subdistrict: Sub-district / tehsil / block / mandal / village from the planner.
        state:       State name from the planner.
        timeout:     HTTP timeout (seconds) per geocoding attempt.

    Returns:
        (latitude, longitude, resolved_name) on success, or (None, None, None).
    """
    # Sanitise placeholder values
    if _clean(district).lower() in _PLACEHOLDERS:
        district = None
    if _clean(subdistrict).lower() in _PLACEHOLDERS:
        subdistrict = None
    if _clean(state).lower() in _PLACEHOLDERS:
        state = None

    if not district and not subdistrict and not state:
        logger.warning("get_lat_long: no usable location parameters provided.")
        return None, None, None

    query = _build_query_string(district, subdistrict, state)
    logger.info("get_lat_long: resolving query=%r", query)

    # --- Strategy 1: Google ---
    lat, lng, name = await _google_geocode(query, timeout=timeout)
    if lat is not None:
        return lat, lng, name

    # --- Strategy 2a: Nominatim (full query) ---
    lat, lng, name = await _nominatim_geocode(
        query,
        state=state,
        district=district or subdistrict,
        timeout=timeout,
    )
    if lat is not None:
        return lat, lng, name

    # --- Strategy 2b: Nominatim (district-only retry when subdistrict failed) ---
    if subdistrict and district:
        fallback_query = _build_query_string(district, None, state)
        lat, lng, name = await _nominatim_geocode(
            fallback_query, state=state, district=district, timeout=timeout
        )
        if lat is not None:
            return lat, lng, name

    # --- Strategy 3: State-centre fallback ---
    lat, lng, name = _state_center_fallback(state)
    if lat is not None:
        return lat, lng, name

    logger.warning(
        "get_lat_long: all strategies failed for district=%r subdistrict=%r state=%r",
        district, subdistrict, state,
    )
    return None, None, None

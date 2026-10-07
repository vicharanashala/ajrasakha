"""Validation and persistence helpers for user-level location storage."""

from __future__ import annotations

import logging
import os
import threading
from typing import Any

import httpx

from ajrasakha.agents.location_context import (
    _PLACEHOLDER_LOCATION_VALUES,
    normalize_state_name,
)
from ajrasakha.agents.user_location_mongo import (
    save_last_rephrased_query,
    save_user_location,
)

logger = logging.getLogger(__name__)

EXPLICIT_LOCATION_SOURCES = frozenset({
    "rephrased_query_text",
    "plan.entities.state (llm)",
    "plan.entities.district (llm)",
    "default_all_when_state_only",
})


def normalize_district_name(district: str | None, *, allow_all: bool = False) -> str | None:
    if not district:
        return None
    cleaned = " ".join(str(district).strip().split())
    if not cleaned:
        return None
    if cleaned.lower() == "all":
        return "all" if allow_all else None
    if cleaned.lower() in _PLACEHOLDER_LOCATION_VALUES:
        return None
    return cleaned.title()


def validate_location(
    state: str | None,
    district: str | None,
    *,
    allow_district_all: bool = False,
) -> bool:
    """Return True when state is valid and district is a real name (or ``all`` when allowed)."""
    normalized_state = normalize_state_name(state)
    if not normalized_state:
        return False
    normalized_district = normalize_district_name(district, allow_all=allow_district_all)
    return bool(normalized_district)


def sanitize_stored_location(
    stored: dict[str, Any] | None,
) -> dict[str, str] | None:
    """Validate and normalize a stored location record for planner use."""
    if not stored:
        return None
    state = normalize_state_name(stored.get("state"))
    district = normalize_district_name(stored.get("district"), allow_all=True)
    if not state or not district:
        logger.warning(
            "Ignoring invalid stored user location state=%r district=%r",
            stored.get("state"),
            stored.get("district"),
        )
        return None
    res: dict[str, Any] = {"state": state, "district": district}
    for key in ("village", "block"):
        if str(stored.get(key) or "").strip():
            res[key] = str(stored[key]).strip()
    lat = stored.get("latitude")
    lon = stored.get("longitude")
    if lat is not None:
        try:
            res["latitude"] = float(lat)
        except (ValueError, TypeError):
            pass
    if lon is not None:
        try:
            res["longitude"] = float(lon)
        except (ValueError, TypeError):
            pass
    return res


def fetch_farmer_profile_location(user_id: str) -> dict[str, Any] | None:
    """The farmer profile location from the Ajrasakha client API (``GET /user/{id}``)."""
    base_url = os.getenv("AJRASAKHA_CLIENT_BASE_URL", "").strip().rstrip("/")
    if not base_url:
        logger.warning("AJRASAKHA_CLIENT_BASE_URL is not set: no farmer profile location")
        return None
    resp = httpx.get(
        f"{base_url}/user/{user_id}",
        headers={"x-api-key": os.getenv("AJRASAKHA_CLIENT_API_KEY", "")},
        timeout=5.0,
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    profile = (resp.json() or {}).get("farmerProfile") or {}
    coords = profile.get("location") or {}
    return {
        "state": profile.get("state"),
        "district": profile.get("district") or "all",
        "village": profile.get("villageName"),
        "block": profile.get("blockName"),
        "latitude": coords.get("latitude"),
        "longitude": coords.get("longitude"),
    }


def load_user_location(user_id: str | None) -> dict[str, str] | None:
    """The farmer profile location from the client API, or None (no fallback:
    the planner then asks the farmer for the location)."""
    if not user_id:
        return None
    try:
        return sanitize_stored_location(fetch_farmer_profile_location(user_id))
    except Exception:
        logger.exception("Failed to load farmerProfile location for user_id=%s", user_id)
        return None


def is_explicit_location_source(state_source: str | None, district_source: str | None) -> bool:
    return (
        state_source in EXPLICIT_LOCATION_SOURCES
        or district_source in EXPLICIT_LOCATION_SOURCES
    )


def maybe_persist_resolved_location(
    user_id: str | None,
    state: str | None,
    district: str | None,
    latitude: float | None = None,      
    longitude: float | None = None,     
    *,
    thread_id: str | None = None,
    state_source: str | None,
    district_source: str | None,
    background: bool = True,
) -> None:
    """Persist location when resolved explicitly from the current query (not stored/prev)."""
    if not user_id:
        return
    if not is_explicit_location_source(state_source, district_source):
        return
    if not validate_location(state, district, allow_district_all=True):
        return

    normalized_state = normalize_state_name(state)
    normalized_district = normalize_district_name(district, allow_all=True) or "all"
    if not normalized_state:
        return

    def _save() -> None:
        save_user_location(
            user_id,
            normalized_district,
            normalized_state,
            thread_id=thread_id,
            state_source=state_source,
            district_source=district_source,
            latitude=latitude,
            longitude=longitude,
        )

    if background:
        threading.Thread(
            target=_save,
            name=f"user-location-save-{user_id[:12]}",
            daemon=False,
        ).start()
    else:
        _save()


def maybe_persist_rephrased_query(
    user_id: str | None,
    rephrased_query: str | None,
    *,
    background: bool = True,
) -> None:
    """Persist the rephrased query when it's explicitly set from the current query."""
    if not user_id:
        return
    query = (rephrased_query or "").strip()
    if not query:
        return

    def _save() -> None:
        save_last_rephrased_query(user_id, query)

    if background:
        threading.Thread(
            target=_save,
            name=f"rephrased-query-save-{user_id[:12]}",
            daemon=False,
        ).start()
    else:
        _save()

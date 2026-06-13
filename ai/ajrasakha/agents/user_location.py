"""Validation and persistence helpers for user-level location storage."""

from __future__ import annotations

import logging
import threading
from typing import Any

from ajrasakha.agents.location_context import (
    _PLACEHOLDER_LOCATION_VALUES,
    normalize_state_name,
)
from ajrasakha.agents.user_location_mongo import get_user_location, save_user_location

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
    return {"state": state, "district": district}


def load_user_location(user_id: str | None) -> dict[str, str] | None:
    if not user_id:
        return None
    stored = sanitize_stored_location(get_user_location(user_id))
    if stored:
        return stored
    from ajrasakha.agents.user_location_mongo import get_farmer_profile_location

    try:
        profile = get_farmer_profile_location(user_id)
    except Exception:
        logger.exception("Failed to load farmerProfile location for user_id=%s", user_id)
        profile = None
    return sanitize_stored_location(profile)


def is_explicit_location_source(state_source: str | None, district_source: str | None) -> bool:
    return (
        state_source in EXPLICIT_LOCATION_SOURCES
        or district_source in EXPLICIT_LOCATION_SOURCES
    )


def maybe_persist_resolved_location(
    user_id: str | None,
    state: str | None,
    district: str | None,
    *,
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
        save_user_location(user_id, normalized_district, normalized_state)

    if background:
        threading.Thread(
            target=_save,
            name=f"user-location-save-{user_id[:12]}",
            daemon=True,
        ).start()
    else:
        _save()

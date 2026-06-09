"""Canonical Indian state names and fuzzy resolution for Golden DB filters."""

from __future__ import annotations

import re

from rapidfuzz import fuzz, process

states_name_list = [
    "All",
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chandigarh",
    "Chhattisgarh",
    "Delhi",
    "England",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu And Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Ladakh",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Not Specified",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
]

STATE_FUZZY_MIN_SCORE = 0.85

_SKIP_FUZZY = frozenset({"all", "general", "none", "null", "not specified", ""})


def _normalize_state_input(raw: str) -> str:
    return re.sub(r"\s+", " ", (raw or "").strip())


def _compact_state_key(raw: str) -> str:
    return re.sub(r"[^a-z0-9]", "", raw.lower())


def resolve_state_name(raw: str, *, min_score: float = STATE_FUZZY_MIN_SCORE) -> str:
    """
    Resolve a raw state string to a canonical name from states_name_list.

    Uses rapidfuzz WRatio; returns the top match only when score is strictly above
    min_score (default 0.85). Passthrough values like empty/all/not specified
    return "all".
    """
    normalized = _normalize_state_input(raw)
    if not normalized or normalized.lower() in _SKIP_FUZZY:
        return "all"

    lower = normalized.lower()
    for canonical in states_name_list:
        if canonical.lower() == lower:
            return canonical

    compact = _compact_state_key(normalized)
    for canonical in states_name_list:
        if _compact_state_key(canonical) == compact:
            return canonical

    match = process.extractOne(
        compact,
        states_name_list,
        scorer=lambda a, b, **kwargs: fuzz.WRatio(a, _compact_state_key(b), **kwargs),
    )
    if match is None:
        return normalized

    canonical, score, _index = match
    if score / 100.0 > min_score:
        return canonical
    return normalized

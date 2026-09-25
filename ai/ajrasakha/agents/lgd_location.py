"""Validate farmer-supplied state/district against the LGD directory.

The directory is the backend's own ``states``/``districts`` collections (the ones
admins curate, aliases included), served read-only over HTTP. It is fetched once
per process and cached, so the planner's check is an in-memory lookup.

The planner LLM extracts a place name in any language; this module decides
whether that place exists. Extraction needs a model, validity is a lookup.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
import unicodedata
from dataclasses import dataclass
from typing import Any, Iterable, Optional

import httpx
from rapidfuzz import fuzz, process

logger = logging.getLogger(__name__)

# Spellings LGD does not carry as aliases. The ACC agent keeps its own copy for
# the call-centre flow (acc_agent/lgd_location.py); these are not imported from
# there because that package pulls in the whole ACC graph.
_STATE_ALIASES = {
    "andaman nicobar islands": "Andaman And Nicobar Islands",
    "dadra and nagar haveli": "Dadra And Nagar Haveli And Daman And Diu",
    "daman and diu": "Dadra And Nagar Haveli And Daman And Diu",
    "delhi ncr": "Delhi",
    "orissa": "Odisha",
    "uttaranchal": "Uttarakhand",
    "pondicherry": "Puducherry",
    "nct of delhi": "Delhi",
    "national capital territory of delhi": "Delhi",
}

_DISTRICT_ALIASES = {
    "ropar": "Rupnagar",
    # LGD lists this district as "S.A.S Nagar" with no aliases of its own.
    "mohali": "S.A.S Nagar",
    "sahibzada ajit singh nagar": "S.A.S Nagar",
    "gurgaon": "Gurugram",
    "allahabad": "Prayagraj",
    "faizabad": "Ayodhya",
    "mewat": "Nuh",
    "bangalore rural": "Bengaluru Rural",
    "bangalore urban": "Bengaluru Urban",
    "bellary": "Ballari",
    "belgaum": "Belagavi",
    "bijapur": "Vijayapura",
    "gulbarga": "Kalaburagi",
    "mysore": "Mysuru",
    "shimoga": "Shivamogga",
    "tumkur": "Tumakuru",
}

# Values that mean "no location given" rather than a place name.
_UNSPECIFIED = frozenset({
    "",
    "all",
    "general",
    "na",
    "n a",
    "none",
    "null",
    "not specified",
    "unknown",
    "unspecified",
})

_FUZZY_THRESHOLD = 88.0
_FUZZY_MARGIN = 5.0


def _normalization_key(value: object, entity_type: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.casefold().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    if entity_type == "state":
        text = re.sub(r"\b(?:state|union territory|ut|india)\b", " ", text)
    elif entity_type == "district":
        text = re.sub(r"\b(?:district|dist|zilla|zila)\b", " ", text)

    return re.sub(r"\s+", " ", text).strip()


def resolve_official_name(
    value: object,
    official_names: Iterable[str],
    *,
    entity_type: str,
    aliases: Optional[dict[str, str]] = None,
) -> Optional[str]:
    """Resolve input to one of the supplied official names, or None when unsure."""
    raw_key = _normalization_key(value, entity_type)
    if not raw_key or raw_key in _UNSPECIFIED:
        return None

    names_by_key = {
        _normalization_key(name, entity_type): name
        for name in official_names
        if str(name).strip()
    }
    if not names_by_key:
        return None

    alias_target = (aliases or {}).get(raw_key)
    if alias_target:
        alias_key = _normalization_key(alias_target, entity_type)
        if alias_key in names_by_key:
            return names_by_key[alias_key]

    if raw_key in names_by_key:
        return names_by_key[raw_key]

    matches = process.extract(raw_key, list(names_by_key), scorer=fuzz.ratio, limit=2)
    if not matches:
        return None
    best_key, best_score, _ = matches[0]
    second_score = matches[1][1] if len(matches) > 1 else 0
    if best_score < _FUZZY_THRESHOLD or best_score - second_score < _FUZZY_MARGIN:
        return None
    return names_by_key[best_key]


# Lookup outcomes.
RESOLVED = "resolved"      # official state (+ district or "all")
INVALID = "invalid"        # a place name was given and it is not in LGD
AMBIGUOUS = "ambiguous"    # district name exists in more than one state
ABSENT = "absent"          # nothing was given to check
UNAVAILABLE = "unavailable"  # directory could not be loaded — fail open


@dataclass(frozen=True)
class LgdLookup:
    status: str
    state: Optional[str] = None
    district: Optional[str] = None
    reason: str = ""


def _downstream_state_keys() -> set[str]:
    """State spellings the rest of the pipeline keys on (GDB filters, weather
    centres, mandi state list). LGD is the authority on whether a place exists,
    but its official spelling is not always the one those tables use."""
    try:
        from ajrasakha.tools.golden.states_name import states_name_list
    except Exception:  # noqa: BLE001 — naming preference only, never fatal
        return set()
    return {_normalization_key(name, "state") for name in states_name_list}


@dataclass(frozen=True)
class _Directory:
    state_names: list[str]
    state_aliases: dict[str, str]
    display_by_state: dict[str, str]
    districts_by_state: dict[str, list[str]]
    district_aliases_by_state: dict[str, dict[str, str]]
    states_by_district_key: dict[str, list[tuple[str, str]]]  # key -> [(state, district)]
    all_district_names: list[str]


_directory: Optional[_Directory] = None
_expires_at: float = 0.0
_retry_after: float = 0.0
_lock: Optional[asyncio.Lock] = None


def lgd_validation_enabled() -> bool:
    return not os.getenv("LGD_VALIDATION_ENABLED", "true").strip().lower() in (
        "false",
        "0",
        "no",
    )


def _api_base() -> str:
    return (os.getenv("LGD_API_BASE").strip()).rstrip("/")


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def is_unspecified_place(value: object, type: str) -> bool:
    return _normalization_key(value, type) in _UNSPECIFIED


async def _fetch(client: httpx.AsyncClient, path: str) -> list[dict[str, Any]]:
    response = await client.get(f"{_api_base()}{path}")
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list) or not payload:
        raise ValueError(f"LGD {path} returned no records")
    return [record for record in payload if isinstance(record, dict)]


def _build_directory(
    states: Iterable[dict[str, Any]],
    districts: Iterable[dict[str, Any]],
) -> _Directory:
    state_names: list[str] = []
    state_aliases: dict[str, str] = dict(_STATE_ALIASES)
    display_by_state: dict[str, str] = {}
    downstream_keys = _downstream_state_keys()
    for record in states:
        name = str(record.get("stateNameEnglish") or "").strip()
        if not name or _normalization_key(name, "state") in _UNSPECIFIED:
            continue
        state_names.append(name)
        record_aliases = [
            str(alias).strip()
            for alias in (record.get("aliases") or [])
            if str(alias).strip()
        ]
        for alias in record_aliases:
            key = _normalization_key(alias, "state")
            if key and key not in _UNSPECIFIED:
                state_aliases[key] = name
        # e.g. LGD says "Keralam"; GDB, the weather centres and the mandi state
        # list all say "Kerala", which LGD itself carries as an alias.
        if downstream_keys and _normalization_key(name, "state") not in downstream_keys:
            known = next(
                (
                    alias
                    for alias in record_aliases
                    if _normalization_key(alias, "state") in downstream_keys
                ),
                None,
            )
            if known:
                display_by_state[name] = known

    districts_by_state: dict[str, list[str]] = {}
    district_aliases_by_state: dict[str, dict[str, str]] = {}
    states_by_district_key: dict[str, list[tuple[str, str]]] = {}
    all_district_names: list[str] = []

    for record in districts:
        name = str(record.get("districtNameEnglish") or "").strip()
        state = str(record.get("stateName") or "").strip()
        if not name or not state:
            continue
        if _normalization_key(name, "district") in _UNSPECIFIED:
            continue
        if _normalization_key(state, "state") in _UNSPECIFIED:
            continue
        districts_by_state.setdefault(state, []).append(name)
        all_district_names.append(name)
        aliases = district_aliases_by_state.setdefault(state, dict(_DISTRICT_ALIASES))
        keys = [_normalization_key(name, "district")]
        for alias in record.get("aliases") or []:
            key = _normalization_key(alias, "district")
            if not key or key in _UNSPECIFIED:
                continue
            aliases[key] = name
            keys.append(key)
        for key in keys:
            if not key:
                continue
            entries = states_by_district_key.setdefault(key, [])
            if (state, name) not in entries:
                entries.append((state, name))

    return _Directory(
        state_names=state_names,
        state_aliases=state_aliases,
        display_by_state=display_by_state,
        districts_by_state=districts_by_state,
        district_aliases_by_state=district_aliases_by_state,
        states_by_district_key=states_by_district_key,
        all_district_names=sorted(set(all_district_names)),
    )


async def prefetch_lgd_directory() -> bool:
    """Load and cache the LGD directory. Never raises; returns True when usable."""
    global _directory, _expires_at, _retry_after, _lock

    if not lgd_validation_enabled():
        return False

    now = time.monotonic()
    if _directory is not None and _expires_at > now:
        return True
    if now < _retry_after:
        return _directory is not None and _expires_at > now

    if _lock is None:
        _lock = asyncio.Lock()

    async with _lock:
        now = time.monotonic()
        if _directory is not None and _expires_at > now:
            return True
        if now < _retry_after:
            return False

        timeout = httpx.Timeout(_float_env("LGD_REQUEST_TIMEOUT_SECONDS", 8.0))
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                states = await _fetch(client, "/location/states")
                districts = await _fetch(client, "/location/districts/all")
            _directory = _build_directory(states, districts)
            _expires_at = time.monotonic() + _float_env("LGD_CACHE_TTL_SECONDS", 86400.0)
            _retry_after = 0.0
            logger.info(
                "LGD directory loaded: %d states, %d districts",
                len(_directory.state_names),
                len(_directory.all_district_names),
            )
            return True
        except Exception as error:  # noqa: BLE001 — never block a farmer on this
            _retry_after = time.monotonic() + _float_env("LGD_RETRY_AFTER_SECONDS", 300.0)
            logger.warning(
                "LGD directory unavailable (%s: %s) — skipping location validation",
                type(error).__name__,
                error,
            )
            return False


def _directory_if_fresh() -> Optional[_Directory]:
    if not lgd_validation_enabled():
        return None
    if _directory is None or _expires_at <= time.monotonic():
        return None
    return _directory


def _match_state(directory: _Directory, value: object) -> Optional[str]:
    return resolve_official_name(
        value,
        directory.state_names,
        entity_type="state",
        aliases=directory.state_aliases,
    )


def _match_district_in_state(
    directory: _Directory,
    state: str,
    value: object,
) -> Optional[str]:
    names = directory.districts_by_state.get(state) or []
    if not names:
        return None
    return resolve_official_name(
        value,
        names,
        entity_type="district",
        aliases=directory.district_aliases_by_state.get(state) or {},
    )


def _match_district_anywhere(
    directory: _Directory,
    value: object,
) -> list[tuple[str, str]]:
    """Return [(state, district)] for a district named without a state."""
    key = _normalization_key(value, "district")
    hits = directory.states_by_district_key.get(key)
    if hits:
        return list(hits)
    fuzzy = resolve_official_name(
        value,
        directory.all_district_names,
        entity_type="district",
        aliases=_DISTRICT_ALIASES,
    )
    if not fuzzy:
        return []
    return list(directory.states_by_district_key.get(_normalization_key(fuzzy, "district")) or [])


def lookup_location(state: object, district: object) -> LgdLookup:
    """Resolve a farmer-supplied place against LGD. In-memory; call prefetch first.

    A district that does not exist inside an otherwise valid state is not an
    error — farmers name towns and villages too — so the state is kept and the
    district falls back to "all". Only a place we cannot place at all is invalid.
    """
    state_given = not is_unspecified_place(state, "state")
    district_given = not is_unspecified_place(district, "district")

    if not state_given and not district_given:
        return LgdLookup(ABSENT, reason="no place in the query")

    directory = _directory_if_fresh()
    if directory is None:
        return LgdLookup(
            UNAVAILABLE,
            state=str(state).strip() if state_given else None,
            district=str(district).strip() if district_given else None,
            reason="directory not loaded",
        )

    official_state = _match_state(directory, state) if state_given else None
    if official_state:
        official_state = directory.display_by_state.get(official_state, official_state)

    if official_state and not district_given:
        return LgdLookup(RESOLVED, official_state, "all", reason="state only")

    if official_state and district_given:
        official_district = _match_district_in_state(directory, official_state, district)
        if official_district:
            return LgdLookup(RESOLVED, official_state, official_district, reason="state + district")
        hits = _match_district_anywhere(directory, district)
        if len(hits) == 1:
            state_name, district_name = hits[0]
            return LgdLookup(
                RESOLVED,
                directory.display_by_state.get(state_name, state_name),
                district_name,
                reason="district overrides state",
            )
        # A place inside a real state that is not a district (town, village…).
        return LgdLookup(
            RESOLVED,
            official_state,
            "all",
            reason="district not in LGD — kept state",
        )

    if district_given:
        hits = _match_district_anywhere(directory, district)
        if len(hits) == 1:
            state_name, district_name = hits[0]
            return LgdLookup(
                RESOLVED,
                directory.display_by_state.get(state_name, state_name),
                district_name,
                reason="district without state",
            )
        if len(hits) > 1:
            return LgdLookup(
                AMBIGUOUS,
                reason=f"district in {len(hits)} states",
            )

    return LgdLookup(INVALID, reason="no matching state or district")


def reset_directory_cache() -> None:
    """Test hook — drop the cached directory."""
    global _directory, _expires_at, _retry_after
    _directory = None
    _expires_at = 0.0
    _retry_after = 0.0


def seed_directory_cache(
    states: Iterable[dict[str, Any]],
    districts: Iterable[dict[str, Any]],
    *,
    ttl_seconds: float = 3600.0,
) -> None:
    """Test hook — install a directory without touching the network."""
    global _directory, _expires_at, _retry_after
    _directory = _build_directory(states, districts)
    _expires_at = time.monotonic() + ttl_seconds
    _retry_after = 0.0

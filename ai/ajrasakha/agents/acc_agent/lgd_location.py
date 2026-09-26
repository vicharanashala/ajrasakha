"""Normalize ACC state and district names against official LGD records."""

import logging
import os
import re
import time
import unicodedata
from typing import Any, Iterable

import aiohttp
from rapidfuzz import fuzz, process


logger = logging.getLogger(__name__)

DEFAULT_LGD_STATES_API_URL = (
    "https://api.data.gov.in/resource/a71e60f0-a21d-43de-a6c5-fa5d21600cdb"
)
DEFAULT_LGD_DISTRICTS_API_URL = (
    "https://api.data.gov.in/resource/37231365-78ba-44d5-ac22-3deec40b9197"
)

_UNSPECIFIED_VALUES = {
    "",
    "all",
    "na",
    "n a",
    "none",
    "null",
    "not specified",
    "unknown",
}

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
    "mohali": "Sahibzada Ajit Singh Nagar",
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


def _is_unspecified(value: object, entity_type: str) -> bool:
    return _normalization_key(value, entity_type) in _UNSPECIFIED_VALUES


def resolve_official_name(
    value: object,
    official_names: Iterable[str],
    *,
    entity_type: str,
    aliases: dict[str, str] | None = None,
    fuzzy_threshold: float = 88.0,
) -> str | None:
    """Resolve input to one supplied official name, or return no safe match."""
    raw_key = _normalization_key(value, entity_type)
    if raw_key in _UNSPECIFIED_VALUES:
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

    matches = process.extract(
        raw_key,
        list(names_by_key),
        scorer=fuzz.ratio,
        limit=2,
    )
    if not matches:
        return None

    best_key, best_score, _ = matches[0]
    second_score = matches[1][1] if len(matches) > 1 else 0
    if best_score < fuzzy_threshold or best_score - second_score < 5:
        return None
    return names_by_key[best_key]


def _record_value(record: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if record.get(key) is not None:
            return record[key]
    return None


def _numeric_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        logger.warning("Invalid %s; using default %s", name, default)
        return default


class LgdLocationNormalizer:
    """Small cached client for the official data.gov.in LGD resources."""

    def __init__(self) -> None:
        self.api_key = os.getenv("LGD_API_KEY", "").strip()
        self.states_api_url = os.getenv(
            "LGD_STATES_API_URL",
            DEFAULT_LGD_STATES_API_URL,
        ).strip()
        self.districts_api_url = os.getenv(
            "LGD_DISTRICTS_API_URL",
            DEFAULT_LGD_DISTRICTS_API_URL,
        ).strip()
        self.cache_ttl_seconds = max(_numeric_env("LGD_CACHE_TTL_SECONDS", 86400), 0)
        self.timeout_seconds = max(
            _numeric_env("LGD_REQUEST_TIMEOUT_SECONDS", 10),
            1,
        )
        self._cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}

    async def _fetch_records(
        self,
        url: str,
        *,
        filters: dict[str, str | int] | None = None,
    ) -> list[dict[str, Any]]:
        if not self.api_key:
            raise RuntimeError("LGD_API_KEY is not configured")

        cache_suffix = "&".join(
            f"{key}={value}" for key, value in sorted((filters or {}).items())
        )
        cache_key = f"{url}?{cache_suffix}"
        cached = self._cache.get(cache_key)
        now = time.monotonic()
        if cached and cached[0] > now:
            return cached[1]

        params: dict[str, str | int] = {
            "api-key": self.api_key,
            "format": "json",
            "limit": 10000,
            "offset": 0,
        }
        for key, value in (filters or {}).items():
            params[f"filters[{key}]"] = value

        timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
        headers = {
            "Accept": "application/json",
            # The data.gov.in gateway can stall requests that use aiohttp's
            # default Python user agent.
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
            ),
        }
        async with aiohttp.ClientSession(
            timeout=timeout,
            headers=headers,
        ) as session:
            async with session.get(url, params=params) as response:
                response.raise_for_status()
                payload = await response.json(content_type=None)

        records = payload.get("records") if isinstance(payload, dict) else None
        if (
            not isinstance(records, list)
            or not records
            or not all(isinstance(record, dict) for record in records)
        ):
            raise RuntimeError("LGD response did not contain any records")

        self._cache[cache_key] = (
            now + self.cache_ttl_seconds,
            records,
        )
        return records

    async def normalize(
        self,
        state: object,
        district: object,
    ) -> tuple[str, str]:
        """Return official state/district names; district matching is state-scoped."""
        if _is_unspecified(state, "state"):
            return "All", "All"

        state_records = await self._fetch_records(self.states_api_url)
        state_names = [
            str(_record_value(record, "state_name_english", "stateNameEnglish") or "")
            for record in state_records
        ]
        official_state = resolve_official_name(
            state,
            state_names,
            entity_type="state",
            aliases=_STATE_ALIASES,
        )
        if not official_state:
            return "All", "All"

        state_key = _normalization_key(official_state, "state")
        state_record = next(
            (
                record
                for record in state_records
                if _normalization_key(
                    _record_value(
                        record,
                        "state_name_english",
                        "stateNameEnglish",
                    ),
                    "state",
                )
                == state_key
            ),
            None,
        )
        state_code = (
            _record_value(state_record, "state_code", "stateCode")
            if state_record
            else None
        )
        if state_code is None:
            raise RuntimeError(f"LGD state code missing for {official_state}")

        if _is_unspecified(district, "district"):
            return official_state, "All"

        district_records = await self._fetch_records(
            self.districts_api_url,
            filters={"state_code": state_code},
        )
        district_names = [
            str(
                _record_value(
                    record,
                    "district_name_english",
                    "districtNameEnglish",
                )
                or ""
            )
            for record in district_records
        ]
        official_district = resolve_official_name(
            district,
            district_names,
            entity_type="district",
            aliases=_DISTRICT_ALIASES,
        )
        return official_state, official_district or "All"


_lgd_normalizer = LgdLocationNormalizer()


async def normalize_location_from_lgd(
    state: object,
    district: object,
) -> tuple[str, str]:
    """Normalize when LGD is available without making extraction unavailable."""
    raw_state = str(state or "All").strip() or "All"
    raw_district = str(district or "All").strip() or "All"
    try:
        return await _lgd_normalizer.normalize(raw_state, raw_district)
    except (aiohttp.ClientError, TimeoutError, RuntimeError, ValueError) as error:
        logger.warning(
            "LGD normalization unavailable; preserving extracted location "
            "(%s): %r",
            type(error).__name__,
            error,
        )
        return raw_state, raw_district

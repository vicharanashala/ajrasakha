"""Load farmer-facing fixed strings from JSON by (script, vocal)."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

OFFICIAL_LANGUAGES = [
    "Assamese",
    "Bengali",
    "Bodo",
    "Dogri",
    "Gujarati",
    "Hindi",
    "Kannada",
    "Kashmiri",
    "Konkani",
    "Maithili",
    "Malayalam",
    "Manipuri (Meitei)",
    "Marathi",
    "Nepali",
    "Odia",
    "Punjabi",
    "Sanskrit",
    "Santali",
    "Sindhi",
    "Tamil",
    "Telugu",
    "Urdu",
    "English",
]

_DEFAULT_SCRIPT = "English"
_DEFAULT_VOCAL = "English"

_CATALOG_PATH = Path(__file__).resolve().parent / "translated_languages.json"
_SCHEMA_VERSION = 1

_TEXT_FIELDS = (
    "two_hour_disclaimer",
    "state_follow_up",
    "crop_follow_up",
    "testing_disclaimer",
    "late_night_disclaimer",
    "early_morning_disclaimer",
    "non_agriculture_reply",
    "weather_unavailable_for_dynamic_weather_queries",
    "crop_price_not_available_in_selected_mandi",
    "mandi_not_available",
)

# The legacy loader stripped surrounding whitespace from these fields. Preserve
# that runtime behavior while keeping the source JSON values unchanged.
_STRIPPED_TEXT_FIELDS = frozenset(
    {
        "two_hour_disclaimer",
        "state_follow_up",
        "crop_follow_up",
        "testing_disclaimer",
        "late_night_disclaimer",
        "early_morning_disclaimer",
    }
)


@dataclass(frozen=True)
class CatalogRow:
    script_language: str
    vocal_language: str
    two_hour_disclaimer: str
    state_follow_up: str
    crop_follow_up: str
    testing_disclaimer: str
    late_night_disclaimer: str
    early_morning_disclaimer: str
    non_agriculture_reply: str
    weather_unavailable_for_dynamic_weather_queries: str
    crop_price_not_available_in_selected_mandi: str
    mandi_not_available: str


def _normalize_lang(name: str) -> str:
    return (name or "").strip()


def _lang_key(script: str, vocal: str) -> tuple[str, str]:
    return (_normalize_lang(script), _normalize_lang(vocal))


def load_catalog(path: Optional[Path] = None) -> dict[tuple[str, str], CatalogRow]:
    """Load and validate all rows from the JSON catalog."""
    catalog_path = path or _CATALOG_PATH
    try:
        payload = json.loads(catalog_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"Unable to read translation catalogue {catalog_path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in translation catalogue {catalog_path}: {exc}") from exc

    if not isinstance(payload, dict):
        raise ValueError(f"Translation catalogue {catalog_path} must contain a JSON object")
    if payload.get("schema_version") != _SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported translation catalogue schema version in {catalog_path}: "
            f"expected {_SCHEMA_VERSION}, got {payload.get('schema_version')!r}"
        )

    rows = payload.get("rows")
    if not isinstance(rows, list):
        raise ValueError(f"Translation catalogue {catalog_path} must contain a rows array")

    catalog: dict[tuple[str, str], CatalogRow] = {}
    for row_number, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise ValueError(
                f"Translation catalogue row {row_number} in {catalog_path} must be an object"
            )

        raw_script = row.get("script_language")
        raw_vocal = row.get("vocal_language")
        script = _normalize_lang(raw_script) if isinstance(raw_script, str) else ""
        vocal = _normalize_lang(raw_vocal) if isinstance(raw_vocal, str) else ""
        if not script or not vocal:
            raise ValueError(
                f"Incomplete translation catalogue row {row_number} in {catalog_path}: "
                "both script_language and vocal_language are required"
            )

        key = _lang_key(script, vocal)
        if key in catalog:
            raise ValueError(
                f"Duplicate translation catalogue row for ({script}, {vocal}) "
                f"at row {row_number} in {catalog_path}"
            )

        texts = row.get("texts")
        if not isinstance(texts, dict):
            raise ValueError(
                f"Translation catalogue row {row_number} in {catalog_path} "
                "must contain a texts object"
            )

        missing_fields = [field for field in _TEXT_FIELDS if field not in texts]
        if missing_fields:
            raise ValueError(
                f"Translation catalogue row {row_number} in {catalog_path} is missing "
                f"required text fields: {', '.join(missing_fields)}"
            )

        unexpected_fields = sorted(set(texts) - set(_TEXT_FIELDS))
        if unexpected_fields:
            raise ValueError(
                f"Translation catalogue row {row_number} in {catalog_path} contains "
                f"unsupported text fields: {', '.join(unexpected_fields)}"
            )

        for field in _TEXT_FIELDS:
            if not isinstance(texts[field], str):
                raise ValueError(
                    f"Translation catalogue row {row_number} field {field!r} "
                    f"in {catalog_path} must be a string"
                )

        def text(field: str) -> str:
            value = texts[field]
            return value.strip() if field in _STRIPPED_TEXT_FIELDS else value

        catalog[key] = CatalogRow(
            script_language=script,
            vocal_language=vocal,
            two_hour_disclaimer=text("two_hour_disclaimer"),
            state_follow_up=text("state_follow_up"),
            crop_follow_up=text("crop_follow_up"),
            testing_disclaimer=text("testing_disclaimer"),
            late_night_disclaimer=text("late_night_disclaimer"),
            early_morning_disclaimer=text("early_morning_disclaimer"),
            non_agriculture_reply=text("non_agriculture_reply"),
            weather_unavailable_for_dynamic_weather_queries=text(
                "weather_unavailable_for_dynamic_weather_queries"
            ),
            crop_price_not_available_in_selected_mandi=text(
                "crop_price_not_available_in_selected_mandi"
            ),
            mandi_not_available=text("mandi_not_available"),
        )

    if _lang_key(_DEFAULT_SCRIPT, _DEFAULT_VOCAL) not in catalog:
        raise ValueError(
            f"Translation catalogue {catalog_path} must contain an English/English fallback row"
        )
    return catalog


_catalog_cache: Optional[dict[tuple[str, str], CatalogRow]] = None


def get_catalog() -> dict[tuple[str, str], CatalogRow]:
    global _catalog_cache
    if _catalog_cache is None:
        _catalog_cache = load_catalog()
    return _catalog_cache


def get_catalog_row(
    script_language: str,
    vocal_language: str,
    *,
    catalog: Optional[dict[tuple[str, str], CatalogRow]] = None,
) -> CatalogRow:
    """Lookup by (script, vocal); fallback to English/English."""
    cat = catalog if catalog is not None else get_catalog()
    script = _normalize_lang(script_language) or _DEFAULT_SCRIPT
    vocal = _normalize_lang(vocal_language) or _DEFAULT_VOCAL
    row = cat.get(_lang_key(script, vocal))
    if row is not None:
        return row
    fallback = cat.get(_lang_key(_DEFAULT_SCRIPT, _DEFAULT_VOCAL))
    if fallback is not None:
        logger.warning(
            "translation_catalog: missing (%s, %s) — using English/English",
            script,
            vocal,
        )
        return fallback
    raise KeyError(f"No catalog row for ({script}, {vocal}) and no English/English fallback")


def get_testing_disclaimer(script_language: str, vocal_language: str) -> str:
    return get_catalog_row(script_language, vocal_language).testing_disclaimer


def get_two_hour_disclaimer(script_language: str, vocal_language: str) -> str:
    return get_catalog_row(script_language, vocal_language).two_hour_disclaimer


def get_state_follow_up(script_language: str, vocal_language: str) -> str:
    return get_catalog_row(script_language, vocal_language).state_follow_up


def get_crop_follow_up(script_language: str, vocal_language: str) -> str:
    return get_catalog_row(script_language, vocal_language).crop_follow_up


def get_late_night_disclaimer(script_language: str, vocal_language: str) -> str:
    """Get the late night disclaimer (10:01 PM - 11:59 PM) for the given language pair."""
    return get_catalog_row(script_language, vocal_language).late_night_disclaimer


def get_early_morning_disclaimer(script_language: str, vocal_language: str) -> str:
    """Get the early morning disclaimer (12:00 AM - 5:59 AM) for the given language pair."""
    return get_catalog_row(script_language, vocal_language).early_morning_disclaimer


def get_non_agriculture_reply(
    script_language: str,
    vocal_language: str,
    *,
    catalog: Optional[dict[tuple[str, str], CatalogRow]] = None,
) -> str:
    """Return the exact localized non-agriculture cell with English fallback."""
    cat = catalog if catalog is not None else get_catalog()
    script = _normalize_lang(script_language) or _DEFAULT_SCRIPT
    vocal = _normalize_lang(vocal_language) or _DEFAULT_VOCAL
    key = _lang_key(script, vocal)
    row = cat.get(key)

    if row is not None and row.non_agriculture_reply.strip():
        return row.non_agriculture_reply

    reason = "missing language pair" if row is None else "blank Non-Agriculture Query cell"
    logger.warning(
        "translation_catalog: %s for (%s, %s) — using English/English "
        "Non-Agriculture Query",
        reason,
        script,
        vocal,
    )

    fallback = cat.get(_lang_key(_DEFAULT_SCRIPT, _DEFAULT_VOCAL))
    if fallback is None or not fallback.non_agriculture_reply.strip():
        raise ValueError(
            "Translation catalogue configuration error: English/English "
            "Non-Agriculture Query must contain a non-blank response"
        )
    return fallback.non_agriculture_reply


def get_weather_unavailable_reply(script_language: str, vocal_language: str) -> str:
    return get_catalog_row(
        script_language, vocal_language
    ).weather_unavailable_for_dynamic_weather_queries


def get_crop_price_unavailable_reply(script_language: str, vocal_language: str) -> str:
    return get_catalog_row(
        script_language, vocal_language
    ).crop_price_not_available_in_selected_mandi


def get_mandi_unavailable_reply(script_language: str, vocal_language: str) -> str:
    return get_catalog_row(script_language, vocal_language).mandi_not_available


def language_pair_from_plan(plan: Optional[dict]) -> tuple[str, str]:
    """Default script/vocal from planner plan."""
    p = plan or {}
    script = _normalize_lang(p.get("script_language") or "") or _DEFAULT_SCRIPT
    vocal = _normalize_lang(p.get("vocal_language") or "") or _DEFAULT_VOCAL
    return script, vocal


def synthesis_lang_label(script_language: str, vocal_language: str) -> str:
    """Legacy label for GDB source prefix helpers (script + vocal)."""
    script = _normalize_lang(script_language) or _DEFAULT_SCRIPT
    vocal = _normalize_lang(vocal_language) or _DEFAULT_VOCAL
    if script == "English" and vocal == "English":
        return "English"
    if script == "English" and vocal == "Hindi":
        return "Hinglish"
    if script == vocal:
        return vocal
    return f"Romanized {vocal}"


def needs_translation(script_language: str, vocal_language: str) -> bool:
    """True when a post-synthesis translate step is required."""
    script, vocal = (
        _normalize_lang(script_language) or _DEFAULT_SCRIPT,
        _normalize_lang(vocal_language) or _DEFAULT_VOCAL,
    )
    return not (script == "English" and vocal == "English")

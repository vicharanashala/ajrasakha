"""Pure helpers for ACC transcript extraction selection and response shaping."""

from typing import Any, Literal, Optional, TypedDict


ExtractionType = Literal["farmer_details", "query_details", "all"]


class ExtractedQuery(TypedDict):
    """One distinct farmer question extracted from a call transcript."""

    query: str
    crop: Optional[str]
    standardized_domains: list[str]


VALID_EXTRACTION_TYPES = frozenset({"farmer_details", "query_details", "all"})


def normalize_extraction_type(value: object) -> ExtractionType:
    """Validate the public extraction selector while preserving legacy callers."""
    normalized = str(value or "all").strip().lower()
    if normalized not in VALID_EXTRACTION_TYPES:
        allowed = ", ".join(sorted(VALID_EXTRACTION_TYPES))
        raise ValueError(
            f"Invalid extraction_type {value!r}. Expected one of: {allowed}"
        )
    return normalized  # type: ignore[return-value]


def _optional_str(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {
        "null",
        "none",
        "n/a",
        "na",
        "all",
        "not specified",
        "unknown",
    }:
        return None
    return text


def _optional_int(value: object) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _non_negative_int(value: object) -> Optional[int]:
    """Return an explicitly supplied non-negative whole-number value."""
    number = _optional_int(value)
    return number if number is not None and number >= 0 else None


def _secondary_crops(value: object, primary_crop: Optional[str]) -> list[str]:
    """Return unique, explicitly extracted crops other than the primary crop."""
    values = value if isinstance(value, (list, tuple, set)) else [value]
    primary_key = primary_crop.casefold() if primary_crop else None
    seen: set[str] = set()
    crops: list[str] = []

    for item in values:
        crop = _optional_str(item)
        if not crop:
            continue
        crop_key = crop.casefold()
        if crop_key == primary_key or crop_key in seen:
            continue
        seen.add(crop_key)
        crops.append(crop)

    return crops


def _domains(value: object) -> list[str]:
    """Normalize a query's domain classification to a non-empty string list."""
    values = value if isinstance(value, (list, tuple, set)) else [value]
    domains: list[str] = []
    seen: set[str] = set()

    for value in values:
        domain = _optional_str(value)
        if not domain:
            continue
        key = domain.casefold()
        if key in seen:
            continue
        seen.add(key)
        domains.append(domain)

    return domains or ["Others"]


def _extracted_queries(data: dict[str, Any]) -> list[ExtractedQuery]:
    """Normalize the new multi-query response, with a legacy single-query fallback."""
    raw_queries = data.get("queries")
    candidates = raw_queries if isinstance(raw_queries, list) else []

    if not candidates:
        candidates = [
            {
                "query": data.get("query"),
                "crop": data.get("crop"),
                "standardized_domains": data.get("standardized_domains"),
            }
        ]

    queries: list[ExtractedQuery] = []
    seen: set[str] = set()
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        query = _optional_str(candidate.get("query"))
        if not query:
            continue
        key = query.casefold()
        if key in seen:
            continue
        seen.add(key)
        queries.append(
            {
                "query": query,
                "crop": _optional_str(candidate.get("crop")),
                "standardized_domains": _domains(
                    candidate.get("standardized_domains")
                ),
            }
        )

    return queries


def build_extraction_update(
    data: dict[str, Any],
    extraction_type: ExtractionType,
) -> dict[str, Any]:
    """Map parsed LLM JSON to only the state fields requested by the caller."""
    common = {
        "extraction_type": extraction_type,
        "extracted_state": data.get("state", "All"),
        "extracted_district": data.get("district", "All"),
        "verified_by_human": False,
    }

    extracted_queries = _extracted_queries(data)
    primary_query = extracted_queries[0] if extracted_queries else None
    query_crop = primary_query["crop"] if primary_query else "All"

    query_details = {
        "extracted_queries": extracted_queries,
    }

    primary_crop = _optional_str(data.get("primary_crop"))
    if (
        not primary_crop
        and extraction_type == "all"
        and query_crop
        and str(query_crop).strip().lower() not in {"all", "not specified", ""}
    ):
        primary_crop = str(query_crop).strip()

    farmer_details = {
        "extracted_name": _optional_str(data.get("name")),
        "extracted_phone": _optional_str(data.get("phone")),
        "extracted_age": _optional_int(data.get("age")),
        "extracted_gender": _optional_str(data.get("gender")),
        "extracted_village": _optional_str(data.get("village")),
        "extracted_block": _optional_str(data.get("block")),
        "extracted_primary_crop": primary_crop,
        "extracted_secondary_crops": _secondary_crops(
            data.get("secondary_crops"),
            primary_crop,
        ),
        "extracted_language_preference": _optional_str(
            data.get("language_preference")
        ),
        "extracted_years_of_experience": _non_negative_int(
            data.get("years_of_experience")
        ),
        "extracted_highest_education": _optional_str(
            data.get("highest_education")
        ),
        "extracted_smartphones_at_home": _non_negative_int(
            data.get("smartphones_at_home")
        ),
    }

    if extraction_type == "farmer_details":
        return {**common, **farmer_details}
    if extraction_type == "query_details":
        return {**common, **query_details}
    return {**common, **query_details, **farmer_details}

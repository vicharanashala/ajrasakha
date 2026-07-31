"""Pure helpers for ACC transcript extraction selection and response shaping."""

from typing import Any, Literal, Optional


ExtractionType = Literal["farmer_details", "query_details", "all"]


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

    query_crop = data.get("crop", "All")
    domains = data.get("standardized_domains", [])
    if isinstance(domains, str):
        domains = [domains]
    if not domains:
        domains = ["Others"]

    query_details = {
        "extracted_query": data.get("query", ""),
        "extracted_crop": query_crop,
        "standardized_domains": domains,
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
    }

    if extraction_type == "farmer_details":
        return {**common, **farmer_details}
    if extraction_type == "query_details":
        return {**common, **query_details}
    return {**common, **query_details, **farmer_details}

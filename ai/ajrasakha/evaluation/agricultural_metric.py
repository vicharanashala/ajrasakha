"""Pure agricultural expectation builder.

This module is deliberately dependency-light: it imports no DeepEval, reads no
environment variables and makes no network calls. It only reads structured
fields from a test case and never writes to the case or its nested objects.

The returned contract is:

    {
        "crop": str | None,
        "crop_aliases": list[str],
        "state": str | None,
        "city": str | None,
        "cultivation_guidance_reference": str | None,
        "cultivation_guidance_reference_source": str | None,
        "applicable": {"crop": bool, "region": bool, "cultivation_guidance": bool},
    }

``None`` is returned when no dimension applies. Missing expected data is never
treated as a zero score.
"""

CROP_EQUIVALENTS = {
    "paddy": ("Paddy", "Rice"),
    "rice": ("Rice", "Paddy"),
}


def _clean_string(value):
    """Return a stripped string for a string input, otherwise ``None``."""
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _crop_expectation(case):
    """Read crop only from ``expected_plan["crop"]``.

    No inference from query text, case name or ``expected_domain``.
    """
    plan = case.get("expected_plan")
    plan = plan if isinstance(plan, dict) else {}

    crop = _clean_string(plan.get("crop"))
    if crop is None or crop.lower() == "all":
        return None, []

    equivalents = CROP_EQUIVALENTS.get(crop.lower())
    aliases = list(equivalents) if equivalents else [crop]
    return crop, aliases


def _region_expectation(case):
    """Read region only from ``location.state`` (and optional ``location.city``).

    ``expected_domain == "General"`` excludes the region dimension; it does not
    exclude crop or cultivation guidance. A state is never derived from a city name.
    """
    if case.get("expected_domain") == "General":
        return None, None

    location = case.get("location")
    location = location if isinstance(location, dict) else {}

    state = _clean_string(location.get("state"))
    if state is None:
        return None, None

    city = _clean_string(location.get("city"))
    return state, city


def _cultivation_guidance_expectation(case):
    """Read cultivation guidance only from a non-empty ``expected_answer``.

    Provenance is copied as given; a missing source stays ``None`` and is never
    invented.
    """
    reference = _clean_string(case.get("expected_answer"))
    if reference is None:
        return None, None

    source = case.get("expected_answer_source")
    return reference, source


def build_agricultural_expectations(case):
    """Build deterministic agricultural expectations from structured fields.

    Returns ``None`` when no dimension applies. Never mutates ``case``.
    """
    crop, crop_aliases = _crop_expectation(case)
    state, city = _region_expectation(case)
    cultivation_guidance_reference, cultivation_guidance_reference_source = (
        _cultivation_guidance_expectation(case)
    )

    applicable = {
        "crop": crop is not None,
        "region": state is not None,
        "cultivation_guidance": cultivation_guidance_reference is not None,
    }

    if not any(applicable.values()):
        return None

    return {
        "crop": crop,
        "crop_aliases": crop_aliases,
        "state": state,
        "city": city,
        "cultivation_guidance_reference": cultivation_guidance_reference,
        "cultivation_guidance_reference_source": cultivation_guidance_reference_source,
        "applicable": applicable,
    }

"""Reviewer / GDB domain gating — when a specific crop is required."""

from __future__ import annotations

from typing import TypedDict

# Domains that REQUIRE a specific crop (not "all").
CROP_REQUIRED_DOMAINS: frozenset[str] = frozenset({
    "Agriculture Mechanization",
    "Bio-Pesticides and Bio-Fertilizers",
    "Crop Insurance",
    "Cultural Practices",
    "Fertilizer Use and Availability",
    "Field Preparation",
    "Nutrient Management",
    "Organic Farming",
    "Plant Protection",
    "Post Harvest Preservation",
    "Seeds",
    "Sowing Time and Weather",
    "Storage",
    "Varieties",
    "Water Management",
    "Weed Management",
    "Market Information",
    "Market Prices",
    "Horticulture & Allied Agriculture",
})

# Domains where crop is automatically "all" / not required.
CROP_ALL_DOMAINS: frozenset[str] = frozenset({
    "Soil Health Card",
    "Soil Testing",
    "Livestock & Animal Husbandry",
    "Veterinary & Animal Health",
    "Fisheries & Aquaculture",
    "Financial & Institutional Services",
    "Extension & Capacity Building",
    "Infrastructure & Utilities",
    "Government Schemes",
    "Weather",
    "General",
})

ALLOWED_DOMAINS: frozenset[str] = CROP_REQUIRED_DOMAINS | CROP_ALL_DOMAINS

ALLOWED_DOMAINS_LIST: list[str] = sorted(ALLOWED_DOMAINS)

# Common LLM / legacy label mistakes -> canonical ALLOWED_DOMAINS name.
_DOMAIN_ALIASES: dict[str, str] = {
    "crop protection": "Plant Protection",
    "plant protection": "Plant Protection",
    "soil health": "Soil Health Card",
    "government scheme": "Government Schemes",
    "government schemes": "Government Schemes",
    "market price": "Market Prices",
    "market prices": "Market Prices",
    "financial and institutional services": "Financial & Institutional Services",
    "pm-kisan": "Financial & Institutional Services",
    "pm kisan": "Financial & Institutional Services",
    "farm machinery and equipment": "Agriculture Mechanization",
    "farm machinery": "Agriculture Mechanization",
}

# Planner routing labels not in reviewer MCP allowed_domains -> upload-safe name.
_REVIEWER_UPLOAD_MAP: dict[str, str] = {
    "Market Prices": "Market Information",
    "Government Schemes": "Financial & Institutional Services",
    "General": "General",
}

_SCHEME_DOMAINS: frozenset[str] = frozenset({
    "Government Schemes",
    "Financial & Institutional Services",
    "Crop Insurance",
})


class PlannerToolFlags(TypedDict, total=False):
    weather: bool
    mandi: bool
    soil: bool
    schemes: bool
    chemical_checker: bool
    knowledge_base: bool


def domain_requires_crop(domain: str) -> bool:
    d = (domain or "").strip()
    if not d:
        return False
    if d in CROP_ALL_DOMAINS:
        return False
    if d in CROP_REQUIRED_DOMAINS:
        return True
    return False


def normalize_domain(raw: str) -> str:
    """Map LLM output to exactly one ALLOWED_DOMAINS value; fallback General."""
    d = (raw or "").strip()
    if not d:
        return "General"
    if d in ALLOWED_DOMAINS:
        return d
    alias = _DOMAIN_ALIASES.get(d.lower())
    if alias:
        return alias
    lowered = d.lower()
    for canonical in ALLOWED_DOMAINS_LIST:
        if canonical.lower() == lowered:
            return canonical
    return "General"


def apply_tool_flags_from_domain(domain: str) -> PlannerToolFlags:
    """Derive planner tool booleans from canonical domain (server-side only)."""
    d = normalize_domain(domain)
    flags: PlannerToolFlags = {
        "weather": False,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": False,
    }
    if d == "Weather":
        flags["weather"] = True
    elif d == "Market Prices":
        flags["mandi"] = True
    elif d in {"Soil Health Card", "Soil Testing"}:
        flags["soil"] = True
    elif d in _SCHEME_DOMAINS:
        flags["schemes"] = True
        flags["knowledge_base"] = False
    elif d in CROP_REQUIRED_DOMAINS:
        flags["knowledge_base"] = True
    return flags


def apply_tool_flags_from_domains(domains: list[str]) -> PlannerToolFlags:
    """OR-union planner flags across multiple canonical domains (server-side only)."""
    out: PlannerToolFlags = {
        "weather": False,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": False,
    }
    for d in domains or []:
        flags = apply_tool_flags_from_domain(d)
        for k, v in flags.items():
            out[k] = bool(out.get(k)) or bool(v)
    return out


def reviewer_upload_domain(domain: str) -> str:
    """
    Map AI planner domain to a name accepted by reviewer MCP allowed_domains.

    MCP lacks Market Prices / Government Schemes / General as upload labels.
    """
    d = normalize_domain(domain)
    return _REVIEWER_UPLOAD_MAP.get(d, d)


def crop_counts_as_resolved(crop: str | None) -> bool:
    """True when crop slot is filled (including all/general placeholders)."""
    if not crop:
        return False
    return crop.strip().lower() not in {"", "not specified", "unknown", "none", "null", "n/a"}


def is_crop_placeholder(crop: str | None) -> bool:
    """True when crop means 'no specific crop' (all/general)."""
    if not crop:
        return False
    return crop.strip().lower() in {"all", "general", "not specified", "none", "null"}

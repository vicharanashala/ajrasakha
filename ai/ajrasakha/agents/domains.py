"""Reviewer / GDB domain gating — when a specific crop is required."""

from __future__ import annotations

from typing import TypedDict

# Domains that REQUIRE a specific crop (not "all").
CROP_REQUIRED_DOMAINS: frozenset[str] = frozenset({
    "Soil Health and Nutrient Management",
    "Irrigation and Water Management",
    "Insect Pest Management",
    "Disease Management",
    "Seed and Variety Selection",
    "Cultural and Crop Management Practices",
    "Organic and Natural Farming",
    "Weed Management",
    "Farm Tools and Mechanisation",
    "Post Harvest Management and Storage",
    "Market Prices MSP and Marketing",
    "Agricultural Schemes and Subsidies",
    "Horticulture and Landscaping",
    "Allied Agricultural Activities",
})

# Domains where crop is automatically "all" / not required.
CROP_ALL_DOMAINS: frozenset[str] = frozenset({
    "Climate Weather and Stress Management",
    "Credit Loan and Insurance",
    "Capacity Building Extension and Communication",
    "Rural Infrastructure",
    "Animal Husbandry and Livestock",
    "Fisheries and Aquaculture",
    "General",
    "NA Invalid Data",
    "Others",
})

ALLOWED_DOMAINS: frozenset[str] = CROP_REQUIRED_DOMAINS | CROP_ALL_DOMAINS

ALLOWED_DOMAINS_LIST: list[str] = sorted(ALLOWED_DOMAINS)

# Common LLM / legacy label mistakes -> canonical ALLOWED_DOMAINS name.
_DOMAIN_ALIASES: dict[str, str] = {
    "plant protection": "Insect Pest Management",
    "insect management": "Insect Pest Management",
    "disease management": "Disease Management",
    "disease": "Disease Management",
    "disease reporting": "Disease Management",
    "pathogenic disease management": "Disease Management",
    "disease (viral)": "Disease Management",
    "disease (bacterial)": "Disease Management",
    "fertilizer use and availability": "Soil Health and Nutrient Management",
    "nutrient management": "Soil Health and Nutrient Management",
    "soil health card": "Soil Health and Nutrient Management",
    "nutrient deficiency/excessiveness management": "Soil Health and Nutrient Management",
    "problem of soil": "Soil Health and Nutrient Management",
    "soil testing": "Soil Health and Nutrient Management",
    "dosage": "Soil Health and Nutrient Management",
    "water management": "Irrigation and Water Management",
    "water management micro irrigation": "Irrigation and Water Management",
    "irrigation management": "Irrigation and Water Management",
    "varieties": "Seed and Variety Selection",
    "varities": "Seed and Variety Selection",
    "vegetative propagation and tissue culture": "Seed and Variety Selection",
    "seed sowing and treatment": "Seed and Variety Selection",
    "varietal selection": "Seed and Variety Selection",
    "cultural practices": "Cultural and Crop Management Practices",
    "cultivation conditions": "Cultural and Crop Management Practices",
    "field preparation": "Cultural and Crop Management Practices",
    "management": "Cultural and Crop Management Practices",
    "integrated farming": "Cultural and Crop Management Practices",
    "nursery management": "Cultural and Crop Management Practices",
    "hormone imbalance management": "Cultural and Crop Management Practices",
    "organic farming": "Organic and Natural Farming",
    "bio-pesticides and bio-fertilizers": "Organic and Natural Farming",
    "weed management": "Weed Management",
    "weather": "Climate Weather and Stress Management",
    "sowing time and weather": "Climate Weather and Stress Management",
    "abiotic stress management": "Climate Weather and Stress Management",
    "agriculture mechanization": "Farm Tools and Mechanisation",
    "plasticulture": "Farm Tools and Mechanisation",
    "storage": "Post Harvest Management and Storage",
    "post harvest preservation": "Post Harvest Management and Storage",
    "cold storage": "Post Harvest Management and Storage",
    "harvesting management": "Post Harvest Management and Storage",
    "post harvest management - abiotic": "Post Harvest Management and Storage",
    "post harvest management - biotic": "Post Harvest Management and Storage",
    "market information": "Market Prices MSP and Marketing",
    "market prices": "Market Prices MSP and Marketing",
    "government schemes": "Agricultural Schemes and Subsidies",
    "credit": "Credit Loan and Insurance",
    "loans": "Credit Loan and Insurance",
    "crop insurance": "Credit Loan and Insurance",
    "training": "Capacity Building Extension and Communication",
    "training and exposure visits": "Capacity Building Extension and Communication",
    "power roads etc": "Rural Infrastructure",
    "dairy production": "Animal Husbandry and Livestock",
    "animal husbandry": "Animal Husbandry and Livestock",
    "poultry": "Animal Husbandry and Livestock",
    "animal nutrition": "Animal Husbandry and Livestock",
    "animal breeding": "Animal Husbandry and Livestock",
    "artificial insemination": "Animal Husbandry and Livestock",
    "horticulture": "Horticulture and Landscaping",
    "floriculture": "Horticulture and Landscaping",
    "spices and condiment crops": "Horticulture and Landscaping",
    "medicinal and aromatic plants": "Horticulture and Landscaping",
    "landscaping": "Horticulture and Landscaping",
    "beekeeping": "Allied Agricultural Activities",
    "mushroom production": "Allied Agricultural Activities",
    "coastal aquaculture": "Fisheries and Aquaculture",
    "fish marketing": "Fisheries and Aquaculture",
    "financial & institutional services": "Credit Loan and Insurance",
    "noisy data": "NA Invalid Data",
    "na (not applicable)": "NA Invalid Data",
}

# Planner routing labels not in reviewer MCP allowed_domains -> upload-safe name.
_REVIEWER_UPLOAD_MAP: dict[str, str] = {
    "Market Prices MSP and Marketing": "Market Information",
    "Agricultural Schemes and Subsidies": "Financial & Institutional Services",
    "Credit Loan and Insurance": "Financial & Institutional Services",
    "General": "General",
}

_SCHEME_DOMAINS: frozenset[str] = frozenset({
    "Agricultural Schemes and Subsidies",
    "Credit Loan and Insurance",
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
    if d == "Climate Weather and Stress Management":
        flags["weather"] = True
    if d == "Market Prices MSP and Marketing":
        flags["mandi"] = True
    if d == "Soil Health and Nutrient Management":
        flags["soil"] = True
    if d in _SCHEME_DOMAINS:
        flags["schemes"] = True
    if d in CROP_REQUIRED_DOMAINS:
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

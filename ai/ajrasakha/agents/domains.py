"""Reviewer / GDB domain gating — when a specific crop is required."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Literal, TypedDict


logger = logging.getLogger(__name__)

CropRequirementMode = Literal[
    "always_required",
    "never_required",
    "conditional",
]


class DomainCropPolicy(TypedDict, total=False):
    mode: CropRequirementMode
    default_crop_required: bool | None
    remarks: str
    description: str
    additional_remarks: dict[str, str] | None

# Fallback values keep older deployments working if the JSON asset is missing.
_LEGACY_CROP_REQUIRED_DOMAINS: frozenset[str] = frozenset({
    "Soil Health and Nutrient Management",
    "Irrigation and Water Management",
    "Insect - Pest Management",
    "Disease Management",
    "Seed and Variety Selection",
    "Cultural and Crop Management Practices",
    "Organic and Natural Farming",
    "Weed Management",
    "Climate, Weather & Stress Management",
    "Farm Tools & Mechanisation",
    "Post-Harvest Management & Storage",
    "Market Prices, MSP & Marketing",
    "Agricultural Schemes & Subsidies",
    "Credit, Loan & Insurance",
    "Capacity Building, Extension and Communication",
    "Allied Agricultural Activities",
    # Legacy names for backward compatibility
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

_LEGACY_CROP_ALL_DOMAINS: frozenset[str] = frozenset({
    "Rural Infrastructure",
    "Animal Husbandry & Livestock",
    "Fisheries & Aquaculture",
    "General",
    # Legacy names for backward compatibility
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
})

def _legacy_domain_policies() -> dict[str, DomainCropPolicy]:
    policies: dict[str, DomainCropPolicy] = {}
    for domain in _LEGACY_CROP_REQUIRED_DOMAINS:
        policies[domain] = {
            "mode": "always_required",
            "default_crop_required": True,
            "remarks": "Always",
        }
    for domain in _LEGACY_CROP_ALL_DOMAINS:
        policies[domain] = {
            "mode": "never_required",
            "default_crop_required": False,
            "remarks": "Never",
        }
    return policies


def _load_domain_crop_policies() -> tuple[dict[str, DomainCropPolicy], dict[str, str]]:
    path = Path(__file__).with_name("domain_crop_requirements.json")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        entries = payload.get("domains")
        if not isinstance(entries, list):
            raise ValueError("domains must be a list")

        policies: dict[str, DomainCropPolicy] = {}
        dynamic_aliases: dict[str, str] = {}
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("name") or "").strip()
            requirement = entry.get("requirement") or {}
            mode = requirement.get("decision_mode")
            if not name or mode not in {
                "always_required",
                "never_required",
                "conditional",
            }:
                continue
            policies[name] = {
                "mode": mode,
                "default_crop_required": entry.get("default_crop_required"),
                "remarks": str(entry.get("remarks") or ""),
                "description": str(entry.get("description") or ""),
                "additional_remarks": entry.get("additional_remarks"),
            }

            # Map domain code if present
            code = str(entry.get("code") or "").strip().lower()
            if code:
                dynamic_aliases[code] = name

            # Map fragmented domains if present
            for frag in entry.get("mapped_fragmented_domains") or []:
                frag_clean = str(frag).strip().lower()
                if frag_clean:
                    dynamic_aliases[frag_clean] = name

        if not policies:
            raise ValueError("no valid domain policies found")
        return policies, dynamic_aliases
    except Exception as exc:
        logger.warning(
            "Could not load domain_crop_requirements.json (%s: %s); using legacy domain policy",
            type(exc).__name__,
            exc,
        )
        return _legacy_domain_policies(), {}


DOMAIN_CROP_POLICIES, _DYNAMIC_DOMAIN_ALIASES = _load_domain_crop_policies()

# CROP_REQUIRED_DOMAINS remains a compatibility name for domains that may need
# crop context. Conditional domains are intentionally included.
CROP_ALWAYS_DOMAINS: frozenset[str] = frozenset(
    domain
    for domain, policy in DOMAIN_CROP_POLICIES.items()
    if policy.get("mode") == "always_required"
)
CROP_NEVER_DOMAINS: frozenset[str] = frozenset(
    domain
    for domain, policy in DOMAIN_CROP_POLICIES.items()
    if policy.get("mode") == "never_required"
)
CROP_CONDITIONAL_DOMAINS: frozenset[str] = frozenset(
    domain
    for domain, policy in DOMAIN_CROP_POLICIES.items()
    if policy.get("mode") == "conditional"
)
CROP_REQUIRED_DOMAINS: frozenset[str] = CROP_ALWAYS_DOMAINS | CROP_CONDITIONAL_DOMAINS
CROP_ALL_DOMAINS: frozenset[str] = CROP_NEVER_DOMAINS

ALLOWED_DOMAINS: frozenset[str] = frozenset(DOMAIN_CROP_POLICIES)
ALLOWED_DOMAINS_LIST: list[str] = sorted(ALLOWED_DOMAINS)

# Common LLM / legacy label mistakes -> canonical ALLOWED_DOMAINS name.
_DOMAIN_ALIASES: dict[str, str] = {
    # Legacy domain mappings to standardized 19 domains
    "weather": "Climate, Weather & Stress Management",
    "sowing time and weather": "Climate, Weather & Stress Management",
    "abiotic stress management": "Climate, Weather & Stress Management",
    "disaster management and crop recovery": "Climate, Weather & Stress Management",
    "climate weather and stress management": "Climate, Weather & Stress Management",

    "plant protection": "Insect - Pest Management",
    "crop protection": "Insect - Pest Management",
    "insect management": "Insect - Pest Management",
    "insect pest management": "Insect - Pest Management",
    "insect–pest management": "Insect - Pest Management",
    "biological pest management": "Insect - Pest Management",
    "pest management": "Insect - Pest Management",
    "pest": "Insect - Pest Management",
    "pesticides": "Insect - Pest Management",

    "disease management": "Disease Management",
    "disease": "Disease Management",
    "disease reporting": "Disease Management",
    "pathogenic disease management": "Disease Management",
    "crop health and disease management": "Disease Management",
    "fungicide": "Disease Management",

    "soil health": "Soil Health and Nutrient Management",
    "soil testing": "Soil Health and Nutrient Management",
    "soil health card": "Soil Health and Nutrient Management",
    "fertilizer use and availability": "Soil Health and Nutrient Management",
    "nutrient management": "Soil Health and Nutrient Management",
    "fertilizer": "Soil Health and Nutrient Management",
    "fertilizers": "Soil Health and Nutrient Management",
    "soil & nutrient management": "Soil Health and Nutrient Management",
    "soil management": "Soil Health and Nutrient Management",

    "water management": "Irrigation and Water Management",
    "micro irrigation": "Irrigation and Water Management",
    "irrigation": "Irrigation and Water Management",
    "irrigation management": "Irrigation and Water Management",
    "fertigation": "Irrigation and Water Management",

    "seeds": "Seed and Variety Selection",
    "seed": "Seed and Variety Selection",
    "varieties": "Seed and Variety Selection",
    "variety": "Seed and Variety Selection",
    "varietal selection": "Seed and Variety Selection",
    "crop varieties": "Seed and Variety Selection",
    "seed sowing and treatment": "Seed and Variety Selection",

    "cultural practices": "Cultural and Crop Management Practices",
    "field preparation": "Cultural and Crop Management Practices",
    "crop management": "Cultural and Crop Management Practices",
    "agronomy": "Cultural and Crop Management Practices",
    "nursery management": "Cultural and Crop Management Practices",

    "organic farming": "Organic and Natural Farming",
    "natural farming": "Organic and Natural Farming",
    "bio-pesticides and bio-fertilizers": "Organic and Natural Farming",
    "bio pesticides and bio fertilizers": "Organic and Natural Farming",

    "weed management": "Weed Management",
    "weed control": "Weed Management",
    "weed": "Weed Management",
    "weeds": "Weed Management",
    "weedicide": "Weed Management",
    "herbicide": "Weed Management",

    "agriculture mechanization": "Farm Tools & Mechanisation",
    "farm machinery": "Farm Tools & Mechanisation",
    "farm machinery and equipment": "Farm Tools & Mechanisation",
    "farm tools and mechanisation": "Farm Tools & Mechanisation",
    "farm tools & mechanisation": "Farm Tools & Mechanisation",
    "farm tools & mechanization": "Farm Tools & Mechanisation",
    "plasticulture": "Farm Tools & Mechanisation",

    "storage": "Post-Harvest Management & Storage",
    "post harvest preservation": "Post-Harvest Management & Storage",
    "post harvest management": "Post-Harvest Management & Storage",
    "post-harvest management": "Post-Harvest Management & Storage",
    "cold storage": "Post-Harvest Management & Storage",
    "post-harvest & value addition": "Post-Harvest Management & Storage",

    "market prices": "Market Prices, MSP & Marketing",
    "market price": "Market Prices, MSP & Marketing",
    "market information": "Market Prices, MSP & Marketing",
    "market & schemes": "Market Prices, MSP & Marketing",
    "mandi": "Market Prices, MSP & Marketing",
    "msp": "Market Prices, MSP & Marketing",

    "government scheme": "Agricultural Schemes & Subsidies",
    "government schemes": "Agricultural Schemes & Subsidies",
    "agricultural schemes and subsidies": "Agricultural Schemes & Subsidies",
    "agricultural schemes & subsidies": "Agricultural Schemes & Subsidies",
    "subsidies": "Agricultural Schemes & Subsidies",
    "subsidy": "Agricultural Schemes & Subsidies",

    "crop insurance": "Credit, Loan & Insurance",
    "credit": "Credit, Loan & Insurance",
    "loans": "Credit, Loan & Insurance",
    "loan": "Credit, Loan & Insurance",
    "kcc": "Credit, Loan & Insurance",
    "insurance": "Credit, Loan & Insurance",
    "financial and institutional services": "Credit, Loan & Insurance",
    "financial & institutional services": "Credit, Loan & Insurance",
    "pm-kisan": "Credit, Loan & Insurance",
    "pm kisan": "Credit, Loan & Insurance",

    "capacity building & extension": "Capacity Building, Extension and Communication",
    "extension & capacity building": "Capacity Building, Extension and Communication",
    "extension and capacity building": "Capacity Building, Extension and Communication",
    "training": "Capacity Building, Extension and Communication",
    "extension services": "Capacity Building, Extension and Communication",

    "power roads etc": "Rural Infrastructure",
    "power, roads etc.": "Rural Infrastructure",
    "infrastructure & utilities": "Rural Infrastructure",
    "infrastructure and utilities": "Rural Infrastructure",
    "rural infrastructure": "Rural Infrastructure",

    "livestock & animal husbandry": "Animal Husbandry & Livestock",
    "livestock and animal husbandry": "Animal Husbandry & Livestock",
    "animal husbandry": "Animal Husbandry & Livestock",
    "dairy production": "Animal Husbandry & Livestock",
    "poultry": "Animal Husbandry & Livestock",
    "veterinary & animal health": "Animal Husbandry & Livestock",
    "veterinary and animal health": "Animal Husbandry & Livestock",

    "fisheries & aquaculture": "Fisheries & Aquaculture",
    "fisheries and aquaculture": "Fisheries & Aquaculture",
    "fisheries": "Fisheries & Aquaculture",
    "aquaculture": "Fisheries & Aquaculture",

    "horticulture & allied agriculture": "Allied Agricultural Activities",
    "horticulture and allied agriculture": "Allied Agricultural Activities",
    "beekeeping": "Allied Agricultural Activities",
    "mushroom production": "Allied Agricultural Activities",
    "allied agricultural activities": "Allied Agricultural Activities",
}
# Merge dynamic aliases extracted from JSON
_DOMAIN_ALIASES.update(_DYNAMIC_DOMAIN_ALIASES)

# Planner routing labels not in reviewer MCP allowed_domains -> upload-safe name.
_REVIEWER_UPLOAD_MAP: dict[str, str] = {
    "General": "General",
}

_SCHEME_DOMAINS: frozenset[str] = frozenset({
    "Agricultural Schemes & Subsidies",
    "Credit, Loan & Insurance",
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
    """Return whether a domain requires crop context by default."""
    d = (domain or "").strip()
    if d.lower() == "crop insurance":
        return True
    policy = get_domain_crop_policy(domain)
    mode = policy.get("mode")
    if mode == "always_required":
        return True
    if mode == "never_required":
        return False
    return bool(policy.get("default_crop_required", False))


def legacy_domain_requires_crop(domain: str) -> bool:
    """Return whether a domain can require crop context."""
    d = normalize_domain(domain)
    if d in DOMAIN_CROP_POLICIES:
        return DOMAIN_CROP_POLICIES[d].get("mode") != "never_required"
    return d in _LEGACY_CROP_REQUIRED_DOMAINS


def get_domain_crop_policy(domain: str) -> DomainCropPolicy:
    """Return the JSON-backed crop policy for a canonical or aliased domain."""
    raw = (domain or "").strip()
    if raw in DOMAIN_CROP_POLICIES:
        return DOMAIN_CROP_POLICIES[raw]
    canonical = normalize_domain(raw)
    return DOMAIN_CROP_POLICIES.get(
        canonical,
        {
            "mode": "never_required",
            "default_crop_required": False,
            "remarks": "",
        },
    )


def domain_crop_requirement_mode(domain: str) -> CropRequirementMode:
    """Return ``always_required``, ``never_required``, or ``conditional``."""
    return get_domain_crop_policy(domain).get("mode", "never_required")


def normalize_domain(raw: str) -> str:
    """Map LLM output to exactly one ALLOWED_DOMAINS value; fallback General."""
    d = (raw or "").strip()
    if not d:
        return "General"
    if d in ALLOWED_DOMAINS:
        return d
    alias = _DOMAIN_ALIASES.get(d.lower())
    if alias and alias in ALLOWED_DOMAINS:
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
    if d == "Climate, Weather & Stress Management":
        flags["weather"] = True
    elif d == "Market Prices, MSP & Marketing":
        flags["mandi"] = True
    elif d == "Soil Health and Nutrient Management":
        flags["soil"] = True
        flags["knowledge_base"] = True
    elif d in _SCHEME_DOMAINS:
        flags["schemes"] = True
        flags["knowledge_base"] = False
    elif d == "Rural Infrastructure":
        flags["schemes"] = True
    elif d == "General":
        pass
    elif d in {
        "Insect - Pest Management",
        "Disease Management",
        "Seed and Variety Selection",
        "Cultural and Crop Management Practices",
        "Organic and Natural Farming",
        "Weed Management",
        "Post-Harvest Management & Storage",
        "Farm Tools & Mechanisation",
        "Allied Agricultural Activities",
        "Animal Husbandry & Livestock",
        "Fisheries & Aquaculture",
        "Capacity Building, Extension and Communication",
        "Irrigation and Water Management",
    } or d in _LEGACY_CROP_REQUIRED_DOMAINS:
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


_CROP_ALL_ALIASES: frozenset[str] = frozenset(
    {
        "all",
        "general",
        "multiple",
        "multiple crop",
        "multiple crops",
        "multiplecrop",
        "multiplecrops",
    }
)

_CROP_UNRESOLVED_ALIASES: frozenset[str] = frozenset(
    {
        "",
        "not specified",
        "unknown",
        "none",
        "null",
        "n/a",
    }
)


def normalize_crop_value(crop: str | None) -> str | None:
    """Normalize every non-specific/missing crop value to the MongoDB value ``all``."""
    if crop is None:
        return "all"
    value = " ".join(str(crop).strip().lower().split())
    if value in _CROP_UNRESOLVED_ALIASES or value in _CROP_ALL_ALIASES:
        return "all"
    return crop


def is_crop_placeholder(crop: str | None) -> bool:
    """True when crop is missing or represents the all-crops scope."""
    normalized = normalize_crop_value(crop)
    return normalized == "all"

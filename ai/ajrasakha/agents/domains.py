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


def _load_domain_crop_policies() -> dict[str, DomainCropPolicy]:
    path = Path(__file__).with_name("domain_crop_requirements.json")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        entries = payload.get("domains")
        if not isinstance(entries, list):
            raise ValueError("domains must be a list")

        policies: dict[str, DomainCropPolicy] = {}
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

        if not policies:
            raise ValueError("no valid domain policies found")
        return policies
    except Exception as exc:
        logger.warning(
            "Could not load domain_crop_requirements.json (%s: %s); using legacy domain policy",
            type(exc).__name__,
            exc,
        )
        return _legacy_domain_policies()


DOMAIN_CROP_POLICIES: dict[str, DomainCropPolicy] = _load_domain_crop_policies()

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
    """Return whether a domain can require crop context.

    This keeps the legacy meaning used by tool routing. Use
    ``domain_crop_requirement_mode`` when the caller needs to distinguish
    deterministic and conditional crop decisions.
    """
    return domain_crop_requirement_mode(domain) != "never_required"


def legacy_domain_requires_crop(domain: str) -> bool:
    """Return the pre-JSON crop-required classification for compatibility paths."""
    return normalize_domain(domain) in _LEGACY_CROP_REQUIRED_DOMAINS


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
    # Tool routing remains on the legacy knowledge-base classification. Crop
    # requirement eligibility is broader because conditional domains may still
    # need a crop without always using the knowledge-base tool.
    elif d in _LEGACY_CROP_REQUIRED_DOMAINS:
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

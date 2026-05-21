"""Reviewer / GDB domain gating — when a specific crop is required."""

from __future__ import annotations

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
    "Market Prices",
    "General",
})

ALLOWED_DOMAINS: frozenset[str] = CROP_REQUIRED_DOMAINS | CROP_ALL_DOMAINS


def domain_requires_crop(domain: str) -> bool:
    d = (domain or "").strip()
    if not d:
        return False
    if d in CROP_ALL_DOMAINS:
        return False
    if d in CROP_REQUIRED_DOMAINS:
        return True
    return False

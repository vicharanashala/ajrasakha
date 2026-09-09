"""Tests for domain normalization and tool-flag derivation."""

from ajrasakha.agents.domains import (
    ALLOWED_DOMAINS,
    apply_tool_flags_from_domain,
    crop_counts_as_resolved,
    domain_crop_requirement_mode,
    domain_requires_crop,
    get_domain_crop_policy,
    normalize_domain,
    reviewer_upload_domain,
)


def test_normalize_domain_exact():
    assert normalize_domain("Insect - Pest Management") == "Insect - Pest Management"
    assert normalize_domain("  Climate, Weather & Stress Management  ") == "Climate, Weather & Stress Management"


def test_normalize_domain_alias():
    assert normalize_domain("Plant Protection") == "Insect - Pest Management"
    assert normalize_domain("Crop Protection") == "Insect - Pest Management"
    assert normalize_domain("soil health") == "Soil Health and Nutrient Management"
    assert normalize_domain("Weather") == "Climate, Weather & Stress Management"
    assert normalize_domain("Market Prices") == "Market Prices, MSP & Marketing"
    assert normalize_domain("SHNM") == "Soil Health and Nutrient Management"
    assert normalize_domain("cwsm") == "Climate, Weather & Stress Management"


def test_normalize_domain_invalid_fallback():
    assert normalize_domain("Not A Real Domain") == "General"
    assert normalize_domain("") == "General"


def test_apply_tool_flags_weather():
    flags = apply_tool_flags_from_domain("Climate, Weather & Stress Management")
    assert flags["weather"] is True
    assert flags["knowledge_base"] is False


def test_apply_tool_flags_plant_protection():
    flags = apply_tool_flags_from_domain("Insect - Pest Management")
    assert flags["knowledge_base"] is True
    assert flags["weather"] is False


def test_apply_tool_flags_schemes():
    flags = apply_tool_flags_from_domain("Credit, Loan & Insurance")
    assert flags["schemes"] is True
    assert flags["knowledge_base"] is False


def test_conditional_crop_policy_does_not_change_legacy_tool_routing():
    flags = apply_tool_flags_from_domain("Rural Infrastructure")
    assert flags["knowledge_base"] is False


def test_domain_requires_crop_buckets():
    assert domain_requires_crop("Insect - Pest Management") is True
    assert domain_requires_crop("Market Prices, MSP & Marketing") is True
    assert domain_requires_crop("Rural Infrastructure") is False
    assert domain_requires_crop("General") is False


def test_json_backed_crop_policy_modes():
    assert domain_crop_requirement_mode("Cultural and Crop Management Practices") == "always_required"
    assert domain_crop_requirement_mode("Rural Infrastructure") == "never_required"
    assert domain_crop_requirement_mode("Climate, Weather & Stress Management") == "conditional"
    assert domain_crop_requirement_mode("Market Prices, MSP & Marketing") == "always_required"

    policy = get_domain_crop_policy("Soil Health and Nutrient Management")
    assert policy["default_crop_required"] is True
    assert policy["remarks"] == "Usually"
    assert "fertility" in policy["description"].lower()


def test_crop_counts_as_resolved():
    assert crop_counts_as_resolved("all") is True
    assert crop_counts_as_resolved("Wheat") is True
    assert crop_counts_as_resolved(None) is False


def test_reviewer_upload_domain_maps_routing_only():
    assert reviewer_upload_domain("Climate, Weather & Stress Management") == "Climate, Weather & Stress Management"
    assert reviewer_upload_domain("Weather") == "Climate, Weather & Stress Management"
    assert reviewer_upload_domain("Insect - Pest Management") == "Insect - Pest Management"
    assert reviewer_upload_domain("bogus") == "General"
    assert reviewer_upload_domain("Insect - Pest Management") in ALLOWED_DOMAINS

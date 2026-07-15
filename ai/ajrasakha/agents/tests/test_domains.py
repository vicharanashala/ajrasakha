"""Tests for domain normalization and tool-flag derivation."""

from ajrasakha.agents.domains import (
    ALLOWED_DOMAINS,
    apply_tool_flags_from_domain,
    crop_counts_as_resolved,
    domain_requires_crop,
    normalize_domain,
    reviewer_upload_domain,
)


def test_normalize_domain_exact():
    assert normalize_domain("Plant Protection") == "Plant Protection"
    assert normalize_domain("  Weather  ") == "Weather"


def test_normalize_domain_alias():
    assert normalize_domain("Crop Protection") == "Plant Protection"
    assert normalize_domain("soil health") == "Soil Health Card"


def test_normalize_domain_invalid_fallback():
    assert normalize_domain("Not A Real Domain") == "General"
    assert normalize_domain("") == "General"


def test_apply_tool_flags_weather():
    flags = apply_tool_flags_from_domain("Weather")
    assert flags["weather"] is True
    assert flags["knowledge_base"] is False


def test_apply_tool_flags_plant_protection():
    flags = apply_tool_flags_from_domain("Plant Protection")
    assert flags["knowledge_base"] is True
    assert flags["weather"] is False


def test_apply_tool_flags_schemes():
    flags = apply_tool_flags_from_domain("Financial & Institutional Services")
    assert flags["schemes"] is True
    assert flags["knowledge_base"] is False


def test_domain_requires_crop_buckets():
    assert domain_requires_crop("Plant Protection") is True
    assert domain_requires_crop("Market Prices") is True
    assert domain_requires_crop("Government Schemes") is False
    assert domain_requires_crop("General") is False


def test_crop_counts_as_resolved():
    assert crop_counts_as_resolved("all") is True
    assert crop_counts_as_resolved("Wheat") is True
    assert crop_counts_as_resolved(None) is False


def test_reviewer_upload_domain_maps_routing_only():
    assert reviewer_upload_domain("Weather") == "Weather"
    assert reviewer_upload_domain("Market Prices") == "Market Information"
    assert reviewer_upload_domain("Plant Protection") == "Plant Protection"
    assert reviewer_upload_domain("bogus") == "General"
    assert reviewer_upload_domain("Plant Protection") in ALLOWED_DOMAINS

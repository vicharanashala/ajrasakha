"""Unit tests for expert-answer quality heuristics and disclaimer stripping."""


from ajrasakha.agents.answer_quality import (
    ensure_two_hour_disclaimer,
    is_no_database_match_answer,
    is_official_government_sourced_answer,
    is_sufficient_expert_answer,
    strip_two_hour_disclaimer,
)

SOIL_HEALTH_ANSWER = """
## Fertilizer Dosage Recommendation for Rice in Ropar, Punjab

Based on your soil test results:
- **Nitrogen (N)**: 120 kg/ha
- **Phosphorus (P)**: 40 kg/ha
- **Potassium (K)**: 30 kg/ha
- **Organic Carbon (OC)**: 0.5%

**Farm Yard Manure (FYM):** 6-8 Tonnes per Hectare

**Source:** https://soilhealth.dac.gov.in/fertilizer-dosage
""".strip()

SUFFICIENT_ANSWER = """
Tomato varieties suitable for Kathua include Pusa Ruby and Arka Vikas.
Apply balanced NPK as per soil test.

Expert: Dr. Sharma
Sources:
- https://example.gov.in/tomato-varieties.pdf

The answer I provided is sourced only from the following approved materials.
""".strip()

TWO_HOUR_BLOCK = (
    "Your question has been sent to Agri Experts at annam.ai, and they will "
    "review it within 2 hours. Please ask the same question after 2 hours for "
    "a detailed answer from our experts."
)


def test_sufficient_expert_answer_detected():
    assert is_sufficient_expert_answer(SUFFICIENT_ANSWER) is True


def test_short_answer_not_sufficient():
    assert is_sufficient_expert_answer("Try neem oil.") is False


def test_strip_disclaimer_from_sufficient_answer():
    combined = f"{SUFFICIENT_ANSWER}\n\n{TWO_HOUR_BLOCK}"
    cleaned = strip_two_hour_disclaimer(combined)
    assert TWO_HOUR_BLOCK not in cleaned
    assert "Tomato varieties" in cleaned
    assert is_sufficient_expert_answer(cleaned)


def test_insufficient_fallback_disclaimer_not_stripped_by_quality_check():
    fallback = (
        "We do not have sufficient information at the moment. Your query has "
        "been transferred to an expert and will be processed within 2 hours."
    )
    assert is_sufficient_expert_answer(fallback) is False


def test_no_database_match_not_treated_as_sufficient():
    no_match = (
        "I apologize, but I was unable to find specific information about COM 0265 "
        "in our expert-verified database for Karnataka."
    )
    assert is_no_database_match_answer(no_match) is True
    assert is_sufficient_expert_answer(no_match) is False


def test_soil_health_official_answer_recognized():
    assert is_official_government_sourced_answer(SOIL_HEALTH_ANSWER) is True


SCHEMES_ANSWER = """
Here are government schemes you may apply for in Punjab:

1. PM-KISAN — Income support for farmers
**Benefit:** Rs 6000 per year in three installments
**Eligibility:** All landholding farmer families
**How to Apply:** Register on PM-KISAN portal or visit nearest CSC

2. Agriculture Infrastructure Fund
**Benefit:** Interest subvention on loans up to Rs 2 crore
**Eligibility:** Farmers, FPOs, agri-entrepreneurs
**How to Apply:** Apply through participating banks
""".strip()


def test_scheme_list_answer_recognized_without_url():
    assert is_official_government_sourced_answer(SCHEMES_ANSWER) is True


def test_ensure_disclaimer_appended_for_no_match():
    no_match = (
        "COM 0265 is not documented in our database. Please contact your nearest KVK."
    )
    result = ensure_two_hour_disclaimer(no_match)
    assert "2 hours" in result
    assert "annam.ai" in result

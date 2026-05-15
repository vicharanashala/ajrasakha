"""Unit tests for expert-answer quality heuristics and disclaimer stripping."""

from ajrasakha.agents.answer_quality import (
    is_sufficient_expert_answer,
    strip_two_hour_disclaimer,
)

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

"""Language detection and output matching."""

from ajrasakha.agents.language import (
    detect_farmer_language,
    language_directive_for_synthesis,
    text_matches_user_language,
)


def test_detect_english_query():
    assert detect_farmer_language("How can I grow paddy in punjab?") == "English"


def test_detect_hindi_query():
    assert detect_farmer_language("पंजाब में धान कैसे उगाएं?") == "Hindi"


def test_english_directive_forbids_hindi_output():
    d = language_directive_for_synthesis("What is the weather today?")
    assert "English" in d
    assert "translate" in d.lower()


def test_reviewer_hindi_answer_english_user_not_matching():
    assert text_matches_user_language(
        "पंजाब में धान की खेती",
        "How can I grow paddy in punjab?",
    ) is False


def test_reviewer_english_answer_english_user_matching():
    assert text_matches_user_language(
        "Grow paddy using PR 133 variety.",
        "How can I grow paddy in punjab?",
    ) is True

"""Tests for deterministic planner vocal/script normalization."""

from __future__ import annotations

from ajrasakha.agents.language import resolve_planner_language_pair

_ROMANIZED_TELUGU = (
    "Barli pantalo aafids ni ela niyantrinchali Andhra pradesh lo?"
)
_NATIVE_TELUGU = "బార్లీ పంటలో ఆఫిడ్స్ ని ఎలా నియంత్రించాలి?"


def test_romanized_telugu_planner_wrong_both_telugu():
    """Planner often sets both to Telugu; server forces script=English."""
    vocal, script = resolve_planner_language_pair(
        _ROMANIZED_TELUGU, "Telugu", "Telugu"
    )
    assert (vocal, script) == ("Telugu", "English")


def test_pure_english_latin():
    vocal, script = resolve_planner_language_pair(
        "How to control aphids in barley in Andhra Pradesh?",
        "English",
        "English",
    )
    assert (vocal, script) == ("English", "English")


def test_native_telugu_unicode():
    vocal, script = resolve_planner_language_pair(
        _NATIVE_TELUGU, "Telugu", "English"
    )
    assert (vocal, script) == ("Telugu", "Telugu")


def test_romanized_hinglish():
    vocal, script = resolve_planner_language_pair(
        "Mera gehu mein keede kaise control karein?",
        "Hindi",
        "Hindi",
    )
    assert script == "English"
    assert vocal == "Hindi"

"""Tests for language helpers and catalog-backed disclaimers."""

import pytest

from ajrasakha.agents.language import (
    language_directive_for_synthesis,
    get_localized_warning_text,
    get_localized_empty_reply_body,
    get_localized_state_question,
    get_localized_crop_question,
)
from ajrasakha.agents.translation_catalog import get_catalog_row


def test_language_directive_english_body_only():
    d = language_directive_for_synthesis("English", "English")
    assert "English" in d
    assert "Do NOT add" in d


def test_language_directive_hinglish_pair():
    d = language_directive_for_synthesis("Hindi", "English")
    assert "Hindi" in d
    assert "script English" in d or "script" in d


def test_localized_disclaimers_from_catalog_english():
    assert "Important Notice" in get_localized_warning_text(script_language="English", vocal_language="English")
    assert "agri expert" in get_localized_empty_reply_body(script_language="English", vocal_language="English")
    assert get_localized_state_question(script_language="English", vocal_language="English") == "Which state and district are you in?"
    assert get_localized_crop_question(script_language="English", vocal_language="English") == "Which crop are you growing?"


def test_localized_follow_ups_hindi_native_vs_romanized():
    native_state = get_localized_state_question(script_language="Hindi", vocal_language="Hindi")
    roman_state = get_localized_state_question(script_language="English", vocal_language="Hindi")
    assert native_state != roman_state
    row_native = get_catalog_row("Hindi", "Hindi")
    row_roman = get_catalog_row("English", "Hindi")
    assert native_state == row_native.state_follow_up
    assert roman_state == row_roman.state_follow_up

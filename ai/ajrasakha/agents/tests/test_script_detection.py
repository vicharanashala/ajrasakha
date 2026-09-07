"""Deterministic script/language detection tests (no LLM, no time dependency).

Deliberately non-duplicative with test_planner_language_pair.py (which already
covers native-Telugu and Romanized-Hinglish resolve_planner_language_pair).
This file focuses on detect_script / detect_script_language (untested elsewhere)
and resolve_planner_language_pair for languages not covered by the planner file.
"""

from __future__ import annotations

import pytest

from ajrasakha.agents.language import (
    detect_script,
    detect_script_language,
    resolve_planner_language_pair,
)

# Native-script farmer queries, one per representative Indian language.
_NATIVE = [
    ("Hindi", "गेहूं की फसल में कीड़े कैसे नियंत्रित करें?"),
    ("Marathi", "गहू पिकातील किडी कशी नियंत्रित करावी?"),
    ("Telugu", "బార్లీ పంటలో ఆఫిడ్స్ ని ఎలా నియంత్రించాలి?"),
    ("Tamil", "பார்லி பயிரில் அசுவினிகளை எவ்வாறு கட்டுப்படுத்துவது?"),
    ("Kannada", "ಬಾರ್ಲಿ ಬೆಳೆಯಲ್ಲಿ ಗಿಡಹೇನುಗಳನ್ನು ಹೇಗೆ ನಿಯಂತ್ರಿಸುವುದು?"),
    ("Malayalam", "ബാർലി വിളയിലെ മുഞ്ഞകളെ എങ്ങനെ നിയന്ത്രിക്കാം?"),
    ("Bengali", "বার্লি ফসলে এফিড কীভাবে নিয়ন্ত্রণ করবেন?"),
    ("Gujarati", "બાર્લી પાકમાં ઉકલિયાને કેવી રીતે નિયંત્રિત કરવું?"),
]

# (script, script_language) expected for each native sample.
_NATIVE_SCRIPT_EXPECTED = {
    "Hindi": ("Devanagari", "Devanagari"),
    "Marathi": ("Devanagari", "Devanagari"),
    "Telugu": ("Telugu", "Telugu"),
    "Tamil": ("Tamil", "Tamil"),
    "Kannada": ("Kannada", "Kannada"),
    "Malayalam": ("Malayalam", "Malayalam"),
    "Bengali": ("Bengali-Assamese", "Bengali-Assamese"),
    "Gujarati": ("Gujarati", "Gujarati"),
}

# Romanized (Latin-script) Indian-language queries.
_ROMANIZED = [
    # Hinglish — Hindi words in Latin script
    ("Mera gehu mein keede kaise control karein?", "Hindi"),
    # Tanglish — Tamil in Latin script
    ("Barli payiril asuvini yepdi control pandradhu?", "Tamil"),
    # Tenglish — Telugu in Latin script
    ("Barli pantalo aafids ni ela niyantrinchali?", "Telugu"),
]


@pytest.mark.parametrize(
    "language,text,script,script_language",
    [
        (language, text, *_NATIVE_SCRIPT_EXPECTED[language])
        for language, text in _NATIVE
    ],
    ids=[language for language, _ in _NATIVE],
)
def test_detect_native_script(language, text, script, script_language):
    assert detect_script(text) == script
    assert detect_script_language(text) == script_language


@pytest.mark.parametrize(
    "text,script,script_language",
    [
        ("How to control aphids in barley?", "Latin", "English"),
        ("", "Latin", "English"),
    ],
    ids=["english", "empty"],
)
def test_detect_latin_script(text, script, script_language):
    assert detect_script(text) == script
    assert detect_script_language(text) == script_language


@pytest.mark.parametrize(
    "text,vocal_language",
    _ROMANIZED,
    ids=["hinglish", "tanglish", "tenglish"],
)
def test_detect_romanized_script_is_latin(text, vocal_language):
    assert detect_script(text) == "Latin"
    assert detect_script_language(text) == "English"


@pytest.mark.parametrize(
    "language,text",
    [
        (language, text)
        for language, text in _NATIVE
        if language != "Telugu"  # native-Telugu resolve covered in test_planner_language_pair.py
    ],
    ids=[language for language, _ in _NATIVE if language != "Telugu"],
)
def test_resolve_planner_language_pair_native(language, text):
    vocal, script = resolve_planner_language_pair(text, language, language)
    assert (vocal, script) == (language, language)


def test_resolve_planner_language_pair_tanglish():
    """Romanized Tamil — the only Romanized resolve case not in the planner file."""
    text = "Barli payiril asuvini yepdi control pandradhu?"
    assert resolve_planner_language_pair(text, "Tamil", "Tamil") == ("Tamil", "English")

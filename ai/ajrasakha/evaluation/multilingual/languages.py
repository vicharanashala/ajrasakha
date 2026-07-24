"""Language registry for the AjraSakha Multilingual Testing Suite.

Each LanguageRecord describes one of the six target languages.
These records are the authoritative source for script/vocal keys, ISO codes,
catalog lookup keys, and Unicode script patterns used by validators.

The catalog lookup keys (catalog_script, catalog_vocal) must match
the (script_language, vocal_language) values in translated_languages.json.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LanguageRecord:
    """Describes one target language for the multilingual test suite.

    Fields
    ------
    code            Short uppercase identifier used in case IDs, e.g. "HI".
    name            Full language name matching OFFICIAL_LANGUAGES, e.g. "Hindi".
    catalog_script  script_language value in translated_languages.json.
    catalog_vocal   vocal_language value in translated_languages.json.
    script_pattern  Regex pattern for Unicode script presence check (from SCRIPT_PATTERNS).
    sample_region   Typical farming region for this language (used in location fixtures).
    sample_state    Indian state for location fixture.
    sample_city     City for location fixture.
    """
    code: str
    name: str
    catalog_script: str
    catalog_vocal: str
    script_pattern: str
    sample_state: str
    sample_city: str


# --- Six target languages ---------------------------------------------------
# Script patterns mirror those in validators/disclaimer_language.py SCRIPT_PATTERNS.

LANGUAGES: list[LanguageRecord] = [
    LanguageRecord(
        code="EN",
        name="English",
        catalog_script="English",
        catalog_vocal="English",
        script_pattern=r"[A-Za-z]",
        sample_state="Punjab",
        sample_city="Ropar",
    ),
    LanguageRecord(
        code="HI",
        name="Hindi",
        catalog_script="Devanagari",
        catalog_vocal="Hindi",
        script_pattern=r"[\u0900-\u097F]",
        sample_state="Uttar Pradesh",
        sample_city="Lucknow",
    ),
    LanguageRecord(
        code="KN",
        name="Kannada",
        catalog_script="Kannada",
        catalog_vocal="Kannada",
        script_pattern=r"[\u0C80-\u0CFF]",
        sample_state="Karnataka",
        sample_city="Mysuru",
    ),
    LanguageRecord(
        code="TA",
        name="Tamil",
        catalog_script="Tamil",
        catalog_vocal="Tamil",
        script_pattern=r"[\u0B80-\u0BFF]",
        sample_state="Tamil Nadu",
        sample_city="Coimbatore",
    ),
    LanguageRecord(
        code="PA",
        name="Punjabi",
        catalog_script="Gurmukhi",
        catalog_vocal="Punjabi",
        script_pattern=r"[\u0A00-\u0A7F]",
        sample_state="Punjab",
        sample_city="Ludhiana",
    ),
    LanguageRecord(
        code="TE",
        name="Telugu",
        catalog_script="Telugu",
        catalog_vocal="Telugu",
        script_pattern=r"[\u0C00-\u0C7F]",
        sample_state="Andhra Pradesh",
        sample_city="Guntur",
    ),
]

LANGUAGE_BY_CODE: dict[str, LanguageRecord] = {lang.code: lang for lang in LANGUAGES}
LANGUAGE_CODES: list[str] = [lang.code for lang in LANGUAGES]

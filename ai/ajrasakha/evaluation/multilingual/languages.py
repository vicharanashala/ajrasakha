"""Language registry for the AjraSakha Multilingual Testing Suite.

Each LanguageRecord describes one of the target languages (India's 22 scheduled languages + English).
These records are the authoritative source for script/vocal keys, ISO codes,
catalog lookup keys, and Unicode script patterns used by validators.

The catalog lookup keys (catalog_script, catalog_vocal) match
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
    script_pattern  Regex pattern for Unicode script presence check.
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


# --- Target languages (22 scheduled Indic languages + English = 23 total) ---

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
    LanguageRecord(
        code="AS",
        name="Assamese",
        catalog_script="Bengali-Assamese",
        catalog_vocal="Assamese",
        script_pattern=r"[\u0980-\u09FF]",
        sample_state="Assam",
        sample_city="Guwahati",
    ),
    LanguageRecord(
        code="BN",
        name="Bengali",
        catalog_script="Bengali-Assamese",
        catalog_vocal="Bengali",
        script_pattern=r"[\u0980-\u09FF]",
        sample_state="West Bengal",
        sample_city="Kolkata",
    ),
    LanguageRecord(
        code="BRX",
        name="Bodo",
        catalog_script="Devanagari",
        catalog_vocal="Bodo",
        script_pattern=r"[\u0900-\u097F]",
        sample_state="Assam",
        sample_city="Kokrajhar",
    ),
    LanguageRecord(
        code="DOI",
        name="Dogri",
        catalog_script="Devanagari",
        catalog_vocal="Dogri",
        script_pattern=r"[\u0900-\u097F]",
        sample_state="Jammu and Kashmir",
        sample_city="Jammu",
    ),
    LanguageRecord(
        code="GU",
        name="Gujarati",
        catalog_script="Gujarati",
        catalog_vocal="Gujarati",
        script_pattern=r"[\u0A80-\u0AFF]",
        sample_state="Gujarat",
        sample_city="Ahmedabad",
    ),
    LanguageRecord(
        code="KS",
        name="Kashmiri",
        catalog_script="Perso-Arabic",
        catalog_vocal="Kashmiri",
        script_pattern=r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]",
        sample_state="Jammu and Kashmir",
        sample_city="Srinagar",
    ),
    LanguageRecord(
        code="KOK",
        name="Konkani",
        catalog_script="Devanagari",
        catalog_vocal="Konkani",
        script_pattern=r"[\u0900-\u097F]",
        sample_state="Goa",
        sample_city="Panaji",
    ),
    LanguageRecord(
        code="MAI",
        name="Maithili",
        catalog_script="Devanagari",
        catalog_vocal="Maithili",
        script_pattern=r"[\u0900-\u097F]",
        sample_state="Bihar",
        sample_city="Darbhanga",
    ),
    LanguageRecord(
        code="ML",
        name="Malayalam",
        catalog_script="Malayalam",
        catalog_vocal="Malayalam",
        script_pattern=r"[\u0D00-\u0D7F]",
        sample_state="Kerala",
        sample_city="Kochi",
    ),
    LanguageRecord(
        code="MNI",
        name="Manipuri (Meitei)",
        catalog_script="Meitei Mayek",
        catalog_vocal="Manipuri (Meitei)",
        script_pattern=r"[\uABC0-\uABFF\uAAE0-\uAAFF]",
        sample_state="Manipur",
        sample_city="Imphal",
    ),
    LanguageRecord(
        code="MR",
        name="Marathi",
        catalog_script="Devanagari",
        catalog_vocal="Marathi",
        script_pattern=r"[\u0900-\u097F]",
        sample_state="Maharashtra",
        sample_city="Pune",
    ),
    LanguageRecord(
        code="NE",
        name="Nepali",
        catalog_script="Devanagari",
        catalog_vocal="Nepali",
        script_pattern=r"[\u0900-\u097F]",
        sample_state="Sikkim",
        sample_city="Gangtok",
    ),
    LanguageRecord(
        code="OR",
        name="Odia",
        catalog_script="Odia",
        catalog_vocal="Odia",
        script_pattern=r"[\u0B00-\u0B7F]",
        sample_state="Odisha",
        sample_city="Bhubaneswar",
    ),
    LanguageRecord(
        code="SA",
        name="Sanskrit",
        catalog_script="Devanagari",
        catalog_vocal="Sanskrit",
        script_pattern=r"[\u0900-\u097F]",
        sample_state="Uttarakhand",
        sample_city="Haridwar",
    ),
    LanguageRecord(
        code="SAT",
        name="Santali",
        catalog_script="Ol Chiki",
        catalog_vocal="Santali",
        script_pattern=r"[\u1C50-\u1C7F]",
        sample_state="Jharkhand",
        sample_city="Ranchi",
    ),
    LanguageRecord(
        code="SD",
        name="Sindhi",
        catalog_script="Perso-Arabic",
        catalog_vocal="Sindhi",
        script_pattern=r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]",
        sample_state="Rajasthan",
        sample_city="Ajmer",
    ),
    LanguageRecord(
        code="UR",
        name="Urdu",
        catalog_script="Perso-Arabic",
        catalog_vocal="Urdu",
        script_pattern=r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]",
        sample_state="Telangana",
        sample_city="Hyderabad",
    ),
]

LANGUAGE_BY_CODE: dict[str, LanguageRecord] = {lang.code: lang for lang in LANGUAGES}
LANGUAGE_CODES: list[str] = [lang.code for lang in LANGUAGES]

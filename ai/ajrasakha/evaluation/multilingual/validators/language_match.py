"""Language match validator — deterministic Unicode script detection.

Checks that the response text contains characters from the expected script,
and meets the minimum script character proportion threshold (≥ 30% native script).

Re-uses the SCRIPT_PATTERNS already defined in the existing
validators/disclaimer_language.py to avoid duplication.
"""

from __future__ import annotations

import re
from typing import Optional

from ajrasakha.evaluation.multilingual.case_schema import MultilingualCase

# Constants for proportion checks (Step 015 boundary checks)
NATIVE_PROPORTION_THRESHOLD = 0.30  # 30% native script characters required
ENGLISH_LATIN_THRESHOLD = 0.60     # 60% Latin characters required for English

# Mirror the patterns from the existing disclaimer_language.py.
try:
    from ajrasakha.evaluation.validators.disclaimer_language import SCRIPT_PATTERNS
except ImportError:
    SCRIPT_PATTERNS: dict[str, str] = {
        "English": r"[A-Za-z]",
        "Hindi": r"[\u0900-\u097F]",
        "Bengali": r"[\u0980-\u09FF]",
        "Gujarati": r"[\u0A80-\u0AFF]",
        "Kannada": r"[\u0C80-\u0CFF]",
        "Kashmiri": r"[\u0600-\u06FF]",
        "Malayalam": r"[\u0D00-\u0D7F]",
        "Odia": r"[\u0B00-\u0B7F]",
        "Punjabi": r"[\u0A00-\u0A7F]",
        "Tamil": r"[\u0B80-\u0BFF]",
        "Telugu": r"[\u0C00-\u0C7F]",
        "Urdu": r"[\u0600-\u06FF]",
    }


def _pattern_for_script(catalog_script: str, vocal_language: str) -> Optional[str]:
    """Return regex pattern for the given catalog_script / vocal_language pair."""
    return (
        SCRIPT_PATTERNS.get(vocal_language)
        or SCRIPT_PATTERNS.get(catalog_script)
    )


def validate_language_match(
    response_text: str,
    case: MultilingualCase,
) -> dict:
    """Check that response_text contains expected script characters and meets proportion threshold.

    Returns a dict with:
        language_pass             bool
        language_reason           str
        language_script_found     bool
        language_proportion       float
        language_proportion_pass  bool
        language_expected_vocal   str
        language_pattern_used     str
    """
    text = str(response_text or "").strip()
    clean_text = re.sub(r"\s+", "", text)
    total_chars = len(clean_text)

    # English is checked against ENGLISH_LATIN_THRESHOLD (0.60)
    if case.expected_vocal == "English":
        if not text or total_chars == 0:
            return {
                "language_pass": False,
                "language_reason": "response is empty",
                "language_script_found": False,
                "language_proportion": 0.0,
                "language_proportion_pass": False,
                "language_expected_vocal": case.expected_vocal,
                "language_pattern_used": SCRIPT_PATTERNS.get("English", r"[A-Za-z]"),
            }
        latin_chars = len(re.findall(r"[A-Za-z]", clean_text))
        prop = round(latin_chars / total_chars, 4)
        prop_pass = prop >= ENGLISH_LATIN_THRESHOLD
        return {
            "language_pass": prop_pass,
            "language_reason": "" if prop_pass else f"Latin character proportion ({prop:.1%}) below threshold ({ENGLISH_LATIN_THRESHOLD:.0%})",
            "language_script_found": latin_chars > 0,
            "language_proportion": prop,
            "language_proportion_pass": prop_pass,
            "language_expected_vocal": case.expected_vocal,
            "language_pattern_used": SCRIPT_PATTERNS.get("English", r"[A-Za-z]"),
        }

    pattern = _pattern_for_script(case.expected_catalog_script, case.expected_vocal)

    if not pattern:
        return {
            "language_pass": False,
            "language_reason": (
                f"no script pattern configured for "
                f"catalog_script={case.expected_catalog_script!r}, "
                f"vocal={case.expected_vocal!r}"
            ),
            "language_script_found": False,
            "language_proportion": 0.0,
            "language_proportion_pass": False,
            "language_expected_vocal": case.expected_vocal,
            "language_pattern_used": "",
        }

    if not text or total_chars == 0:
        return {
            "language_pass": False,
            "language_reason": "response is empty",
            "language_script_found": False,
            "language_proportion": 0.0,
            "language_proportion_pass": False,
            "language_expected_vocal": case.expected_vocal,
            "language_pattern_used": pattern,
        }

    native_chars = len(re.findall(pattern, clean_text))
    found = native_chars > 0
    prop = round(native_chars / total_chars, 4)
    prop_pass = prop >= NATIVE_PROPORTION_THRESHOLD

    reasons = []
    if not found:
        reasons.append(f"expected {case.expected_vocal} script (pattern={pattern!r}) not found in response")
    elif not prop_pass:
        reasons.append(f"{case.expected_vocal} script proportion ({prop:.1%}) below threshold ({NATIVE_PROPORTION_THRESHOLD:.0%})")

    return {
        "language_pass": found and prop_pass,
        "language_reason": "; ".join(reasons),
        "language_script_found": found,
        "language_proportion": prop,
        "language_proportion_pass": prop_pass,
        "language_expected_vocal": case.expected_vocal,
        "language_pattern_used": pattern,
    }


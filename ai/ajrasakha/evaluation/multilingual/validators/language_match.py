"""Language match validator — deterministic Unicode script detection.

Checks that the response text contains characters from the expected script.
Re-uses the SCRIPT_PATTERNS already defined in the existing
validators/disclaimer_language.py to avoid duplication.

This is the primary "did the agent respond in the right language?" check.
It is purely regex-based — no LLM, no network calls.
"""

from __future__ import annotations

import re
from typing import Optional

from ajrasakha.evaluation.multilingual.case_schema import MultilingualCase

# Mirror the patterns from the existing disclaimer_language.py.
# We import them at runtime to stay in sync, with a local fallback.
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
    """Return regex pattern for the given catalog_script / vocal_language pair.

    The SCRIPT_PATTERNS dict is keyed by vocal language name (e.g. "Hindi"),
    not by catalog_script (e.g. "Devanagari"). We try both.
    """
    return (
        SCRIPT_PATTERNS.get(vocal_language)
        or SCRIPT_PATTERNS.get(catalog_script)
    )


def validate_language_match(
    response_text: str,
    case: MultilingualCase,
) -> dict:
    """Check that response_text contains the expected script characters.

    Returns a dict with:
        language_pass           bool
        language_reason         str  (empty on pass)
        language_script_found   bool
        language_expected_vocal str
        language_pattern_used   str
    """
    text = str(response_text or "").strip()

    # English is always present in any response (tool names, numbers, etc.).
    # For English cases we just verify the response is non-empty.
    if case.expected_vocal == "English":
        if not text:
            return {
                "language_pass": False,
                "language_reason": "response is empty",
                "language_script_found": False,
                "language_expected_vocal": case.expected_vocal,
                "language_pattern_used": "",
            }
        # Any non-empty response from an English query is a pass for script check
        return {
            "language_pass": True,
            "language_reason": "",
            "language_script_found": True,
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
            "language_expected_vocal": case.expected_vocal,
            "language_pattern_used": "",
        }

    if not text:
        return {
            "language_pass": False,
            "language_reason": "response is empty",
            "language_script_found": False,
            "language_expected_vocal": case.expected_vocal,
            "language_pattern_used": pattern,
        }

    found = bool(re.search(pattern, text))
    reason = "" if found else (
        f"expected {case.expected_vocal} script "
        f"(pattern={pattern!r}) not found in response"
    )

    return {
        "language_pass": found,
        "language_reason": reason,
        "language_script_found": found,
        "language_expected_vocal": case.expected_vocal,
        "language_pattern_used": pattern,
    }

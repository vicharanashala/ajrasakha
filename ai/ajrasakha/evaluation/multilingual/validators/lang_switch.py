"""Mid-answer language switch detector (deterministic).

A "language switch" is defined as: a response in a non-Latin script that also
contains a significant amount of Latin-only sentences not attributable to
technical terms (numbers, URLs, tool names, known agri-terms in English).

Heuristic approach (no LLM):
  1. For English responses: no switch possible, always PASS.
  2. For non-English responses:
     a. Split response into word-tokens.
     b. Strip tokens that are numbers, URLs, or whitelisted technical terms.
     c. Count remaining Latin-only tokens.
     d. If Latin-only tokens exceed LATIN_SWITCH_THRESHOLD (default 30%),
        flag as potential language switch.

This is intentionally conservative (avoids false positives on crop names
spelled in Latin in a Hindi/Kannada response, which is acceptable).
"""

from __future__ import annotations

import re

from ajrasakha.evaluation.multilingual.case_schema import MultilingualCase

# Tokens that are allowed in a non-English response without triggering a switch:
# - Numbers / percentages / currency
# - URLs
# - Known tool/system tokens
# - Common Latin agri-abbreviations
_ALLOWED_LATIN_PATTERNS: list[re.Pattern] = [
    re.compile(r"^\d[\d.,\-/%₹$°CFK]*$"),                 # numbers / units
    re.compile(r"^https?://\S+$"),                          # URLs
    re.compile(r"^www\.\S+$"),                              # bare URLs
    re.compile(r"^[A-Z]{2,6}$"),                            # acronyms: NPK, IMD, PM
    re.compile(r"^(Annam|AjraSakha|eNAM|APMCs?|IMD|"
               r"Agmarknet|IARI|ICAR|KVK|FCI|mandi|"
               r"Kharif|Rabi|Zaid|paddy|wheat|rice|"
               r"maize|cotton|mustard|urea|DAP|MOP|"
               r"NPK|pH|ha|kg|ml|lt?r?|quintal|"
               r"acre|hectare)$", re.IGNORECASE),            # common agri terms
]

# Threshold: if > N% of cleaned tokens are Latin-only, flag as switch.
LATIN_SWITCH_THRESHOLD = 0.30


def _is_allowed_latin(token: str) -> bool:
    """Return True if a Latin token is expected in a non-English response."""
    return any(p.match(token) for p in _ALLOWED_LATIN_PATTERNS)


def _count_latin_tokens(text: str) -> tuple[int, int]:
    """Return (latin_tokens, total_tokens) after removing allowed ones."""
    words = re.split(r"[\s\n\r]+", text)
    words = [w.strip(".,!?;:\"'()[]{}") for w in words if w.strip()]
    total = len(words)
    if total == 0:
        return 0, 0

    latin_count = 0
    for word in words:
        if not re.search(r"[A-Za-z]", word):
            continue  # non-Latin token, fine
        if _is_allowed_latin(word):
            continue  # allowed Latin term
        latin_count += 1

    return latin_count, total


def validate_lang_switch(
    response_text: str,
    case: MultilingualCase,
    threshold: float = LATIN_SWITCH_THRESHOLD,
) -> dict:
    """Detect unexpected language switching in the response.

    Returns:
        lang_switch_detected    bool  (True = problem found)
        lang_switch_ratio       float (fraction of unexpected Latin tokens)
        lang_switch_reason      str
    """
    text = str(response_text or "").strip()

    # English responses cannot switch away from English
    if case.expected_vocal == "English":
        return {
            "lang_switch_detected": False,
            "lang_switch_ratio": 0.0,
            "lang_switch_reason": "",
        }

    if not text:
        return {
            "lang_switch_detected": False,
            "lang_switch_ratio": 0.0,
            "lang_switch_reason": "response is empty — cannot evaluate",
        }

    # Check if the response even contains native script characters
    native_pattern = _native_script_pattern(case.expected_catalog_script)
    if native_pattern and not re.search(native_pattern, text):
        # No native script at all — the language check will catch this
        return {
            "lang_switch_detected": False,
            "lang_switch_ratio": 0.0,
            "lang_switch_reason": (
                "no native script detected — deferred to language_match validator"
            ),
        }

    latin_count, total = _count_latin_tokens(text)
    ratio = latin_count / total if total > 0 else 0.0

    if ratio > threshold:
        return {
            "lang_switch_detected": True,
            "lang_switch_ratio": round(ratio, 3),
            "lang_switch_reason": (
                f"{latin_count}/{total} tokens ({ratio:.0%}) are unexpected Latin — "
                f"possible mid-answer language switch (threshold={threshold:.0%})"
            ),
        }

    return {
        "lang_switch_detected": False,
        "lang_switch_ratio": round(ratio, 3),
        "lang_switch_reason": "",
    }


def _native_script_pattern(catalog_script: str) -> str | None:
    """Return a regex pattern for the given catalog_script, or None."""
    _MAP = {
        "Devanagari": r"[\u0900-\u097F]",
        "Kannada": r"[\u0C80-\u0CFF]",
        "Tamil": r"[\u0B80-\u0BFF]",
        "Gurmukhi": r"[\u0A00-\u0A7F]",
        "Telugu": r"[\u0C00-\u0C7F]",
        "Bengali-Assamese": r"[\u0980-\u09FF]",
        "Gujarati": r"[\u0A80-\u0AFF]",
        "Malayalam": r"[\u0D00-\u0D7F]",
        "Odia": r"[\u0B00-\u0B7F]",
    }
    return _MAP.get(catalog_script)

"""Script and language detection for AjraSakha responses.

We deliberately do **not** use a heavyweight ML language ID here — the
suite must run cheaply in CI.  Unicode block ranges are sufficient to
distinguish the 6 supported languages because each uses a unique
script (Devanagari, Gurmukhi, Kannada, Tamil, Telugu, Latin).
"""
from __future__ import annotations

from typing import Dict, List, Tuple

from qa.tests.multilingual.translations.language_meta import (
    SCRIPT_RANGES,
    SUPPORTED_LANGUAGES,
)


def _char_in_ranges(ch: str, ranges: List[Tuple[int, int]]) -> bool:
    cp = ord(ch)
    return any(lo <= cp <= hi for lo, hi in ranges)


def script_ratio(text: str, language: str) -> float:
    """Return the fraction of *significant* characters in `language`'s script.

    "Significant" means letters and digits — punctuation, whitespace
    and emoji are ignored so a stray Hindi punctuation mark in an
    English reply does not falsely inflate the ratio.
    """
    if not text:
        return 0.0

    ranges = SCRIPT_RANGES.get(language, [])
    if not ranges:
        return 0.0

    total = 0
    matched = 0
    for ch in text:
        cat = _category(ch)
        if cat in {"letter", "digit"}:
            total += 1
            if _char_in_ranges(ch, ranges):
                matched += 1
    if total == 0:
        return 0.0
    return matched / total


def _category(ch: str) -> str:
    """Tiny Unicode category helper (avoids importing ``unicodedata``)."""
    cp = ord(ch)
    # Letters (very rough)
    if (0x0041 <= cp <= 0x005A) or (0x0061 <= cp <= 0x007A):
        return "letter"
    if (0x0900 <= cp <= 0x097F) or (0x0A00 <= cp <= 0x0A7F) \
            or (0x0B80 <= cp <= 0x0BFF) or (0x0C00 <= cp <= 0x0C7F) \
            or (0x0C80 <= cp <= 0x0CFF):
        return "letter"
    # Digits
    if 0x0030 <= cp <= 0x0039:
        return "digit"
    if 0x0966 <= cp <= 0x096F or 0x0A66 <= cp <= 0x0A6F \
            or 0x0BE6 <= cp <= 0x0BEF or 0x0C66 <= cp <= 0x0C6F \
            or 0x0CE6 <= cp <= 0x0CEF:
        return "digit"
    return "other"


def detect_response_language(text: str) -> str:
    """Return the language (key from ``SUPPORTED_LANGUAGES``) most likely.

    Picks the script with the highest ratio.  Falls back to
    ``"english"`` when nothing matches (e.g. only digits / punctuation).
    """
    if not text or not text.strip():
        return "english"

    scores = {lang: script_ratio(text, lang) for lang in SUPPORTED_LANGUAGES}
    best_lang, best_score = max(scores.items(), key=lambda kv: kv[1])
    if best_score < 0.30:
        return "english"  # noisy / mostly non-letter -> assume English
    return best_lang


def detect_language_switch(text: str, query_language: str) -> Dict[str, object]:
    """Detect whether the reply contains chunks in multiple scripts.

    Returns a dict with:

    * ``switched`` (bool) — ``True`` if more than one non-trivial script
      appears in the response;
    * ``primary`` (str)  — script with the highest share;
    * ``secondary`` (str | None) — the second-largest, if it clears
      a 15 % floor;
    * ``per_script_ratio`` (dict) — script -> ratio (0..1);
    * ``off_script_chars`` (int)  — count of letters/digits in a
      script that is *neither* the query script nor Latin.

    The 15 % floor and the per-script counts are exposed so callers
    can decide how strict to be.  ``language_switch_check`` applies
    the strict rule.
    """
    per_script: Dict[str, float] = {
        lang: script_ratio(text, lang) for lang in SUPPORTED_LANGUAGES
    }

    # count "off-script" letters — those in a script neither the query
    # nor English (English is allowed as a co-script for code-mixed
    # responses, e.g. "Apply 2 ml/litre").
    off_script = 0
    if text:
        for ch in text:
            if _category(ch) != "letter":
                continue
            in_query = query_language in SCRIPT_RANGES and _char_in_ranges(
                ch, SCRIPT_RANGES[query_language]
            )
            in_latin = _char_in_ranges(ch, SCRIPT_RANGES["english"])
            if not in_query and not in_latin:
                off_script += 1

    # rank scripts
    ranked = sorted(per_script.items(), key=lambda kv: kv[1], reverse=True)
    primary, primary_score = ranked[0]
    secondary: str | None = None
    secondary_score = 0.0
    for lang, score in ranked[1:]:
        if score >= 0.15:
            secondary = lang
            secondary_score = score
            break

    switched = (
        secondary is not None
        and primary_score >= 0.30
        and secondary_score >= 0.15
    )

    return {
        "switched": switched,
        "primary": primary,
        "primary_score": round(primary_score, 4),
        "secondary": secondary,
        "secondary_score": round(secondary_score, 4),
        "per_script_ratio": {k: round(v, 4) for k, v in per_script.items()},
        "off_script_chars": off_script,
    }
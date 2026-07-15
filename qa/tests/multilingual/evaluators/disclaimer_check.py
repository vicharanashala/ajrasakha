"""Disclaimer evaluator.

AjraSakha appends a 2-hour advice-age disclaimer to every reply.  The
suite checks two independent things:

1. **Presence** — does the response contain *some* form of the
   disclaimer (any of the supported languages)?
2. **Language match** — does the disclaimer appear in the same
   language as the query (or at least in the same script)?

We deliberately accept either the *exact* localized text from
``DISCLAIMER_TEXT`` *or* a fuzzy match (the disclaimer is also
free-form re-translated by the answer-generation LLM in some flows,
and we want to detect that too).
"""
from __future__ import annotations

from typing import Dict

from qa.tests.multilingual.translations.language_meta import (
    DISCLAIMER_TEXT,
    SUPPORTED_LANGUAGES,
)


DISCLAIMER_REGEX_HINTS = (
    "2 hour", "2 घंटे", "2 ਘੰਟੇ", "2 గంటల", "2 ಗಂಟೆ", "2 மணி",
    "advice may be", "verify before", "सलाह", "ਸਲਾਹ", "సలహా", "ಸಲಹೆ", "ஆலோசனை",
)


def _has_any_disclaimer_hint(text: str) -> bool:
    """Cheap regex-free check: any of the canonical disclaimer fragments."""
    if not text:
        return False
    lower = text.lower()
    for hint in DISCLAIMER_REGEX_HINTS:
        if hint.lower() in lower:
            return True
    return False


def evaluate_disclaimer(
    *,
    response_text: str,
    query_language: str,
) -> Dict[str, object]:
    """Return the disclaimer evaluation result.

    Keys: ``present`` (bool), ``language_match`` (bool), ``expected`` (str),
    ``detected_script`` (str | None), ``confidence`` (float in [0,1]).
    """
    if not response_text:
        return {
            "present": False,
            "language_match": False,
            "expected": DISCLAIMER_TEXT.get(query_language, ""),
            "detected_script": None,
            "confidence": 0.0,
        }

    # Per-language substring search of the canonical (or close variant)
    matches: Dict[str, bool] = {}
    for lang in SUPPORTED_LANGUAGES:
        expected = DISCLAIMER_TEXT.get(lang, "")
        if expected and expected[:30].lower() in response_text.lower():
            matches[lang] = True
        else:
            # partial match — first 10 non-trivial chars
            snippet = expected.strip().split("\n")[0][:10]
            matches[lang] = bool(snippet) and snippet in response_text

    present = _has_any_disclaimer_hint(response_text) or any(matches.values())
    detected_langs = [lang for lang, hit in matches.items() if hit]
    language_match = query_language in detected_langs

    confidence = 1.0 if language_match else (
        0.5 if present and detected_langs else 0.0
    )

    return {
        "present": present,
        "language_match": language_match,
        "expected": DISCLAIMER_TEXT.get(query_language, ""),
        "detected_script": detected_langs[0] if detected_langs else None,
        "confidence": confidence,
    }


__all__ = ["evaluate_disclaimer"]
"""Translations package for the multilingual testing suite.

Exposes a single :func:`get_translation_lookup` helper that returns the
canonical ``scenario_id -> {language: prompt}`` mapping for all 180
test cases (30 scenarios × 6 languages).  Each per-language translation
file is independently testable.
"""
from __future__ import annotations

from typing import Dict, List

# Import language metadata
from .language_meta import (  # noqa: F401
    SUPPORTED_LANGUAGES,
    LANGUAGE_LABELS,
    LANGUAGE_DISPLAY,
    LANGUAGE_NATIVE,
    SCRIPT_RANGES,
    DISCLAIMER_TEXT,
    DISCLAIMER_KEYWORDS_EN,
)

# Import per-language translation tables.  Filenames are
# ``hi_<iso>.py`` (legacy naming).
from .hi_hi import HINDI_TRANSLATIONS    # noqa: F401
from .hi_en import ENGLISH_TRANSLATIONS  # noqa: F401
from .hi_kn import KANNADA_TRANSLATIONS  # noqa: F401
from .hi_ta import TAMIL_TRANSLATIONS    # noqa: F401
from .hi_pa import PUNJABI_TRANSLATIONS  # noqa: F401
from .hi_te import TELUGU_TRANSLATIONS   # noqa: F401

ALL_TRANSLATIONS: Dict[str, Dict[str, str]] = {
    "hindi":   HINDI_TRANSLATIONS,
    "english": ENGLISH_TRANSLATIONS,
    "kannada": KANNADA_TRANSLATIONS,
    "tamil":   TAMIL_TRANSLATIONS,
    "punjabi": PUNJABI_TRANSLATIONS,
    "telugu":  TELUGU_TRANSLATIONS,
}


def get_translation_lookup() -> Dict[str, Dict[str, str]]:
    """Return the full ``scenario_id -> {language: prompt}`` map.

    The returned structure is built freshly on every call so test harnesses
    cannot mutate the module-level table by accident.
    """
    return {
        sid: {lang: tbl[sid] for lang, tbl in ALL_TRANSLATIONS.items()}
        for sid in HINDI_TRANSLATIONS.keys()
    }


def get_flat_test_cases() -> List[Dict[str, str]]:
    """Return the flat list of 180 test cases (one dict per case).

    Each dict: ``{"case_id", "scenario_id", "domain", "language", "prompt"}``.
    """
    from qa.tests.multilingual.scenarios.farming_scenarios import FARMING_SCENARIOS

    lookup = get_translation_lookup()
    flat: List[Dict[str, str]] = []
    for scenario in FARMING_SCENARIOS:
        sid = scenario["id"]
        for lang in SUPPORTED_LANGUAGES:
            flat.append(
                {
                    "case_id":     f"{sid}__{LANGUAGE_LABELS[lang]}",
                    "scenario_id": sid,
                    "domain":      scenario["domain"],
                    "language":    lang,
                    "prompt":      lookup[sid][lang],
                }
            )
    return flat


__all__ = [
    "ALL_TRANSLATIONS",
    "get_translation_lookup",
    "get_flat_test_cases",
    # Re-exports for convenience
    "SUPPORTED_LANGUAGES",
    "LANGUAGE_LABELS",
    "LANGUAGE_DISPLAY",
    "LANGUAGE_NATIVE",
    "SCRIPT_RANGES",
    "DISCLAIMER_TEXT",
    "DISCLAIMER_KEYWORDS_EN",
    "HINDI_TRANSLATIONS",
    "ENGLISH_TRANSLATIONS",
    "KANNADA_TRANSLATIONS",
    "TAMIL_TRANSLATIONS",
    "PUNJABI_TRANSLATIONS",
    "TELUGU_TRANSLATIONS",
]

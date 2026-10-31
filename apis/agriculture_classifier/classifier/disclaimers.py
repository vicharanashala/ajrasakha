"""Disclaimer-text lookup, keyed by language name - and script-based
candidate grouping for language detection. Both are derived directly from
the CSV at data/ at load time, so adding a new language row works with no
code change, as long as it uses a Unicode script already listed in
_SCRIPT_RANGES below (those 12 ranges already cover every script used by
India's 22 scheduled languages + Latin/English - a genuinely new script,
not just a new language, would need a new range added here).
Self-contained: no import from any other apis/* service or ai/ajrasakha/*.
"""

import csv
import logging
from pathlib import Path

log = logging.getLogger("agriculture_classifier.disclaimers")

_DISCLAIMERS_PATH = Path(__file__).resolve().parent.parent / "data" / "agriculture_disclaimers.csv"

# Unicode script ranges only - which languages use each one is derived from
# the CSV's own disclaimer text (_script_groups), never hardcoded.
_SCRIPT_RANGES: list[tuple[int, int]] = [
    (0x0900, 0x097F),  # Devanagari
    (0x0980, 0x09FF),  # Bengali-Assamese
    (0x0A00, 0x0A7F),  # Gurmukhi
    (0x0A80, 0x0AFF),  # Gujarati
    (0x0B00, 0x0B7F),  # Odia
    (0x0B80, 0x0BFF),  # Tamil
    (0x0C00, 0x0C7F),  # Telugu
    (0x0C80, 0x0CFF),  # Kannada
    (0x0D00, 0x0D7F),  # Malayalam
    (0x0600, 0x06FF),  # Perso-Arabic
    (0x1C50, 0x1C7F),  # Ol Chiki
    (0xABC0, 0xABFF),  # Meitei Mayek
]

_cache: dict[str, str] | None = None
_script_groups_cache: dict[int | None, list[str]] | None = None


def _load(path: Path = _DISCLAIMERS_PATH) -> dict[str, str]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = {row["Language"].strip(): row["Translation"] for row in csv.DictReader(f)}
    if not rows:
        raise RuntimeError(f"Disclaimer CSV at {path} is empty")
    if "English" not in rows:
        raise RuntimeError(f"Disclaimer CSV at {path} has no 'English' row - required as the universal fallback")
    return rows


def known_languages() -> list[str]:
    """Every language name the CSV currently defines a disclaimer for."""
    global _cache
    if _cache is None:
        _cache = _load()
    return list(_cache.keys())


def get_disclaimer(language: str) -> str:
    global _cache
    if _cache is None:
        _cache = _load()
    if language in _cache:
        return _cache[language]
    # Never log the disclaimer text itself, only the language that missed.
    log.warning("No disclaimer for language=%r, falling back to English", language)
    return _cache["English"]


def _dominant_script(text: str) -> int | None:
    """Index into _SCRIPT_RANGES for the most-represented script in text,
    or None for no match (Latin/romanized/punctuation/numbers)."""
    counts: dict[int, int] = {}
    for ch in text:
        cp = ord(ch)
        for i, (lo, hi) in enumerate(_SCRIPT_RANGES):
            if lo <= cp <= hi:
                counts[i] = counts.get(i, 0) + 1
                break
    if not counts:
        return None
    return max(counts, key=counts.get)


def _script_groups() -> dict[int | None, list[str]]:
    """Which known languages share each script - computed from the CSV's
    own disclaimer text, not hardcoded. A language's script is detected the
    same way an incoming question's is, so a newly added CSV row is grouped
    automatically on next load."""
    global _script_groups_cache
    if _script_groups_cache is not None:
        return _script_groups_cache
    groups: dict[int | None, list[str]] = {}
    for language, text in _load().items():
        groups.setdefault(_dominant_script(text), []).append(language)
    _script_groups_cache = groups
    return groups


def script_candidates(text: str) -> list[str]:
    """Deterministic, LLM-free script detection for an incoming question.
    Returns every known language that shares the question's dominant
    script - a single-language script returns directly (no LLM needed);
    a shared script returns the full group for the caller to disambiguate.
    A script unseen in any CSV row falls back to ["English"]."""
    script = _dominant_script(text)
    return _script_groups().get(script) or ["English"]

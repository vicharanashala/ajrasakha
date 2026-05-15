"""Heuristics for expert-answer quality and 2-hour disclaimer handling."""

from __future__ import annotations

import re

# Minimum body length (excluding disclaimer) to treat an answer as substantive.
MIN_ANSWER_LENGTH = 150

_EXPERT_INDICATORS = re.compile(
    r"expert|author|agri\s*specialist|agriexpert|specialist|reviewed\s+by",
    re.IGNORECASE,
)
_URL_PATTERN = re.compile(r"https?://|www\.", re.IGNORECASE)
_SOURCE_INDICATORS = re.compile(
    r"source|reference|sourced\s+from|approved\s+materials",
    re.IGNORECASE,
)

# Patterns for the 2-hour reviewer-queue disclaimer (case-insensitive, multiline).
_TWO_HOUR_DISCLAIMER_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"Your question has been sent to Agri Experts at annam\.ai[^\n]*"
        r"(?:\n[^\n]*)*?"
        r"(?:Please ask the same (?:question|query) after 2 hours[^\n]*\.?\s*)",
        re.IGNORECASE | re.DOTALL,
    ),
    re.compile(
        r"#\s*Your query has also been shared with an expert for review\.[^\n]*2 hours[^\n]*\.?\s*",
        re.IGNORECASE,
    ),
    re.compile(
        r"#\s*We do not have sufficient information[^\n]*2 hours[^\n]*\.?\s*",
        re.IGNORECASE,
    ),
    re.compile(
        r"We do not have sufficient information at the moment\.[^\n]*2 hours[^\n]*\.?\s*",
        re.IGNORECASE,
    ),
    re.compile(
        r"Your query has been transferred to an expert[^\n]*2 hours[^\n]*\.?\s*",
        re.IGNORECASE,
    ),
]


def is_sufficient_expert_answer(text: str) -> bool:
    """Return True when the answer looks detailed with expert attribution and sources.

    Matches the product rule from Hemanth/Karan: skip the 2-hour disclaimer when the
    reply includes agriculture expert names, sources, and/or relevant links.
    """
    if not text:
        return False

    stripped = text.strip()
    if len(stripped) < MIN_ANSWER_LENGTH:
        return False

    has_link = bool(_URL_PATTERN.search(stripped))
    has_expert = bool(_EXPERT_INDICATORS.search(stripped))
    has_source = bool(_SOURCE_INDICATORS.search(stripped))

    quality_signals = sum([has_expert, has_source, has_link])
    return quality_signals >= 2 or (has_link and has_expert)


def strip_two_hour_disclaimer(text: str) -> str:
    """Remove 2-hour reviewer-queue disclaimer blocks from *text*."""
    result = text
    for pattern in _TWO_HOUR_DISCLAIMER_PATTERNS:
        result = pattern.sub("", result)
    # Collapse excessive blank lines left after removal.
    return re.sub(r"\n{3,}", "\n\n", result).strip()

"""Heuristics for expert-answer quality and 2-hour disclaimer handling."""

from __future__ import annotations

import re
from typing import Any

# Minimum body length (excluding disclaimer) to treat an answer as substantive.
MIN_ANSWER_LENGTH = 150

# Appended when GDB/upload could not answer (must match farmer-facing copy in prompts).
TWO_HOUR_DISCLAIMER = (
    "Your question has been sent to Agri Experts at annam.ai, and they will "
    "review it within 2 hours. Please ask the same question after 2 hours for "
    "a detailed answer from our experts."
)

# LLM replies that admit no GDB hit or partial/insufficient results —
# still need the 2-hour line for the farmer.
_NO_DATABASE_MATCH = re.compile(
    r"unable to find|could not find|couldn't find|was unable to find|"
    r"not find specific|not documented|does not appear in|"
    r"not (?:in|available in) (?:our |the )?(?:comprehensive )?"
    r"(?:agricultural )?database|"
    r"no (?:specific )?information(?: was)? found|"
    r"not available in (?:our|the) (?:approved )?sources?|"
    # Partial / insufficient / limited data admissions
    r"(?:found |have )?limited (?:information|data|content|results)|"
    r"insufficient (?:information|data|content)|"
    r"(?:do not|don't) have (?:enough|sufficient|complete|detailed) (?:information|data)|"
    r"(?:could not|couldn't) find (?:complete|detailed|comprehensive|specific)|"
    r"(?:no |not enough )(?:relevant |specific )?(?:data|information|content) (?:available|found)|"
    r"mainly focused on .{1,60} rather than|"
    r"(?:not|no) (?:complete|comprehensive|detailed) (?:information|data|content)|"
    r"we do not have .{0,40} for (?:your|this|the) (?:query|question)",
    re.IGNORECASE,
)

# ── Testing-version warning disclaimer ────────────────────────────────────
# The testing disclaimer contains URLs, source names (Annam.ai, IMD, etc.)
# and words like "expert-verified" that create false-positive attribution
# signals. We must strip it before running source-attribution heuristics.
_WARNING_DISCLAIMER_PATTERN = re.compile(
    r"⚠️[^\n]*Important Notice[^\n]*⚠️.*$",
    re.IGNORECASE | re.DOTALL,
)


def _coerce_message_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts).strip()
    return str(content).strip()


def strip_warning_disclaimer(text: str) -> str:
    """Remove the testing-version warning disclaimer from *text*.

    This is essential before running source-attribution heuristics because
    the disclaimer itself contains URLs, 'Annam.ai', 'sourced from IMD',
    'Agmarknet', etc. which would create false positives.
    """
    return _WARNING_DISCLAIMER_PATTERN.sub("", text).strip()

_EXPERT_INDICATORS = re.compile(
    r"expert|author|agri\s*specialist|agriexpert|specialist|reviewed\s+by",
    re.IGNORECASE,
)
_URL_PATTERN = re.compile(r"https?://|www\.", re.IGNORECASE)
_SOURCE_INDICATORS = re.compile(
    r"source|reference|sourced\s+from|approved\s+materials",
    re.IGNORECASE,
)

# Official government APIs — answers citing these are tool-sourced (not LLM hallucination).
_OFFICIAL_GOV_SOURCE = re.compile(
    r"soilhealth\.dac\.gov\.in|"
    r"mausam\.imd\.gov\.in|imd\.gov\.in|\bIMD\b|"
    r"enam\.gov\.in|\bAgmarknet\b|\beNAM\b|"
    r"myscheme\.gov\.in|"
    r"APMC|mandi|modal\s+price",
    re.IGNORECASE,
)

# Soil Health Card / fertilizer dosage replies from the soil MCP tool.
_SOIL_HEALTH_ANSWER = re.compile(
    r"soilhealth\.dac\.gov\.in|"
    r"fertilizer[- ]?dosage|"
    r"soil\s+test|"
    r"organic\s+carbon|\bOC\b|"
    r"farm\s+yard\s+manure|\bFYM\b|"
    r"vermicompost|azospirillum|psb\s*@",
    re.IGNORECASE,
)

_GOVT_SCHEME_ANSWER = re.compile(
    r"government\s+scheme|welfare\s+scheme|central\s+scheme|state\s+scheme|"
    r"pm[- ]?kisan|pm[- ]?fby|pm[- ]?kmy|"
    r"subsidy|eligibility|how\s+to\s+apply|"
    r"financial\s+assistance|benefit\s*[:\-]",
    re.IGNORECASE,
)

_TOOL_FAILURE = re.compile(
    r"temporarily unavailable|tool execution failed",
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


def is_official_government_sourced_answer(text: str) -> bool:
    """True when the answer cites official weather/market/soil/scheme government data.

    These answers come from official MCP tools (IMD, Agmarknet, Soil Health Card, myscheme).
    """
    if not text:
        return False
    stripped = strip_warning_disclaimer(text.strip())
    if not stripped:
        return False
    if _OFFICIAL_GOV_SOURCE.search(stripped):
        return True
    # Soil tool answers often label the portal without the full URL in every line.
    if _SOIL_HEALTH_ANSWER.search(stripped) and (
        "kg/ha" in stripped.lower()
        or "tonnes" in stripped.lower()
        or "hectare" in stripped.lower()
    ):
        return True
    if _looks_like_government_scheme_answer(stripped):
        return True
    return False


def _looks_like_government_scheme_answer(text: str) -> bool:
    """Numbered scheme lists from myscheme tool often omit the URL in the body."""
    if not text or len(text) < 80:
        return False
    if not _GOVT_SCHEME_ANSWER.search(text):
        return False
    numbered_items = re.findall(r"(?:^|\n)\s*\d+\.\s+\S", text)
    return len(numbered_items) >= 1 or "myscheme" in text.lower()


def is_no_database_match_answer(text: str) -> bool:
    """True when the reply says GDB / approved sources had no answer for the query."""
    return bool(text and _NO_DATABASE_MATCH.search(text))


def has_two_hour_disclaimer(text: str) -> bool:
    """True when the standard 2-hour reviewer-queue message is already present."""
    if not text:
        return False
    lower = text.lower()
    return (
        "2 hours" in lower or "2 hour" in lower
    ) and (
        "annam.ai" in lower
        or "transferred to an expert" in lower
        or "shared with an expert" in lower
        or "sent to agri experts" in lower
    )


def is_sufficient_expert_answer(text: str) -> bool:
    """Return True when the answer looks detailed with expert attribution and sources.

    Matches the product rule from Hemanth/Karan: skip the 2-hour disclaimer when the
    reply includes agriculture expert names, sources, and/or relevant links.

    A long “we could not find this in our database” reply is NOT sufficient.
    """
    if not text:
        return False

    if is_no_database_match_answer(text):
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


def ensure_two_hour_disclaimer(text: str) -> str:
    """Append the 2-hour disclaimer when it is missing and the answer is not sufficient."""
    if not text or has_two_hour_disclaimer(text):
        return text.strip() if text else ""
    return f"{text.rstrip()}\n\n{TWO_HOUR_DISCLAIMER}"

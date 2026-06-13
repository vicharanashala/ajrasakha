"""Deterministic farmer-facing footers — sources, 2-hour, testing disclaimer.

Never passed through the translate LLM; keyed by (script_language, vocal_language).
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.translation_catalog import (
    get_testing_disclaimer,
    get_two_hour_disclaimer,
    synthesis_lang_label,
)

# IST timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

# Hardcoded time-based disclaimers (English only)
_DISCLAIMER_LATE_NIGHT = (
    "Your question has been forwarded to our agri expert. "
    "You will receive a response by tomorrow, 8:00 AM."
)

_DISCLAIMER_VERY_EARLY_MORNING = (
    "Your question has been forwarded to our agri expert. "
    "You will receive a response by today, 8:00 AM."
)


def get_time_aware_expert_disclaimer(script_language: str, vocal_language: str) -> str:
    """Return the appropriate expert queue disclaimer based on current IST time.

    - 10:01 PM - 11:59 PM (hour 22-23): response by tomorrow 8:00 AM
    - 12:00 AM - 5:59 AM (hour 0-5): response by today 8:00 AM
    - Otherwise: use the sheet-localized 2-hour disclaimer
    """
    now_ist = datetime.now(IST)
    hour = now_ist.hour

    # Scenario 1: 10:01 PM - 11:59 PM (hours 22-23)
    if 22 <= hour <= 23:
        return _DISCLAIMER_LATE_NIGHT

    # Scenario 2: 12:00 AM - 5:59 AM (hours 0-5)
    if 0 <= hour <= 5:
        return _DISCLAIMER_VERY_EARLY_MORNING

    # Default: use sheet-localized 2-hour disclaimer
    return get_two_hour_disclaimer(script_language, vocal_language)


SOURCES_HEADER_EN = "📚 Sources:"
EXPERT_PREFIX_EN = "👤 Answered by:"
SOURCE_LINK_PREFIX = "🔗"


def _format_source_line(details: dict) -> str:
    """Format source line with 🔗 prefix.

    When source_name is "Database Document" or not available, only show the link.
    Format: 🔗 SourceName: https://link OR 🔗 https://link
    """
    source_name = details.get("source_name")
    source_link = details.get("source_link")

    is_db_doc = (source_name or "").strip().lower() == "database document"

    if is_db_doc or not source_name:
        # Only show the link
        if source_link:
            return f"{SOURCE_LINK_PREFIX} {source_link}"
    elif source_name and source_link:
        return f"{SOURCE_LINK_PREFIX} {source_name}: {source_link}"
    elif source_name:
        return f"{SOURCE_LINK_PREFIX} {source_name}"
    elif source_link:
        return f"{SOURCE_LINK_PREFIX} {source_link}"

    return ""


def collect_all_sources(gdb_data: dict) -> str:
    """Collect source attribution (English-only) from exact match and all similar pairs.

    Handles details as both a single dict (legacy) and a list of dicts (new format).
    - Collects unique authors separately (deduplicated)
    - Collects unique sources separately (deduplicated)
    Output format:
        👤 Answered by: Author1, Author2

        📚 Sources:
        🔗 SourceName: https://link
        🔗 https://link
    """
    seen_sources: set[tuple] = set()
    seen_authors: set[str] = set()
    source_lines: list[str] = []
    author_names: list[str] = []

    def _process_details(details: dict) -> None:
        if not details:
            return

        source_name = details.get("source_name")
        source_link = details.get("source_link")
        author_name = details.get("author_name")

        # Handle source deduplication
        source_key = (source_name, source_link)
        if source_key not in seen_sources:
            seen_sources.add(source_key)
            line = _format_source_line(details)
            if line:
                source_lines.append(line)

        # Handle author deduplication
        if author_name and author_name.strip():
            if author_name not in seen_authors:
                seen_authors.add(author_name)
                author_names.append(author_name)

    def _process_details_field(details_raw) -> None:
        """Handle details as a list of dicts or a single dict."""
        if isinstance(details_raw, list):
            for d in details_raw:
                if isinstance(d, dict):
                    _process_details(d)
        elif isinstance(details_raw, dict):
            _process_details(details_raw)

    exact = gdb_data.get("exact_match") or {}
    if (exact.get("answer") or "").strip():
        _process_details_field(exact.get("details") or {})

    for i in range(1, 6):
        pair = gdb_data.get(f"similar_pair{i}")
        if (
            pair
            and isinstance(pair, dict)
            and (pair.get("answer") or "").strip()
        ):
            _process_details_field(pair.get("details") or {})

    if not source_lines and not author_names:
        return ""

    parts: list[str] = []

    # Add authors section
    if author_names:
        authors_str = ", ".join(author_names)
        parts.append(f"{EXPERT_PREFIX_EN} {authors_str}")

    # Add sources section
    if source_lines:
        if parts:
            parts.append("")  # Empty line between sections
        parts.append(SOURCES_HEADER_EN)
        parts.extend(source_lines)

    return "\n".join(parts)


def build_expert_queue_content(script_language: str, vocal_language: str) -> str:
    """Time-aware expert-queue text + testing disclaimer (no LLM).

    Uses conditional disclaimer based on current IST time:
    - 10:01 PM - 11:59 PM: response by tomorrow 8:00 AM
    - 12:00 AM - 5:59 AM: response by today 8:00 AM
    - Otherwise: sheet-localized 2-hour disclaimer
    """
    body = get_time_aware_expert_disclaimer(script_language, vocal_language)
    testing = get_testing_disclaimer(script_language, vocal_language)
    return f"{body}\n\n{testing}"


def finalize_synthesis_answer(
    body: str,
    *,
    script_language: str,
    vocal_language: str,
    gdb_data: Optional[dict],
    is_greeting: bool = False,
) -> str:
    """Synthesize path: translated body → GDB sources (author) → testing disclaimer only."""
    out = (body or "").strip()
    if not out:
        return out
    if is_greeting:
        return out
    if gdb_data and gdb_has_usable_answers(gdb_data):
        source_block = collect_all_sources(gdb_data)
        if source_block:
            out = f"{out}\n\n{source_block}"
    testing = get_testing_disclaimer(script_language, vocal_language)
    if testing.strip():
        return f"{out}\n\n{testing}"
    return out


# Backward-compatible alias
finalize_farmer_answer = finalize_synthesis_answer

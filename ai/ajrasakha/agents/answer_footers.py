"""Deterministic farmer-facing footers — sources, 2-hour, testing disclaimer.

Never passed through the translate LLM; keyed by (script_language, vocal_language).
"""

from __future__ import annotations

from typing import Optional

from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.translation_catalog import (
    get_testing_disclaimer,
    get_two_hour_disclaimer,
    synthesis_lang_label,
)


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
    """Sheet-localized 2-hour expert-queue text + testing disclaimer (no LLM)."""
    body = get_two_hour_disclaimer(script_language, vocal_language)
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

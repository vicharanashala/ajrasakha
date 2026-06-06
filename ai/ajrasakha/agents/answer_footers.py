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


SOURCES_HEADER_EN = (
    "The answer I provided is sourced only from the following approved materials."
)
SOURCE_PREFIX_EN = "📚 Source:"
EXPERT_PREFIX_EN = "👨‍🌾 Agri Expert:"


def _format_source_attribution(details: dict) -> str:
    """Format source name (with embedded link) + author name for final output (English-only).

    When source_name is "Database Document", only show the link — hide the label.
    """
    lines: list[str] = []
    source_name = details.get("source_name")
    source_link = details.get("source_link")
    author_name = details.get("author_name")

    is_db_doc = (source_name or "").strip().lower() == "database document"

    if is_db_doc:
        # Only show the link, skip the "Database Document" label entirely
        if source_link:
            lines.append(f"{SOURCE_PREFIX_EN} {source_link}")
    elif source_name and source_link:
        lines.append(f"{SOURCE_PREFIX_EN} {source_name} ({source_link})")
    elif source_name:
        lines.append(f"{SOURCE_PREFIX_EN} {source_name}")
    elif source_link:
        lines.append(f"{SOURCE_PREFIX_EN} {source_link}")

    if author_name:
        lines.append(f"{EXPERT_PREFIX_EN} {author_name}")

    return "\n".join(lines)


def collect_all_sources(gdb_data: dict) -> str:
    """Collect source attribution (English-only) from exact match and all similar pairs.

    Handles details as both a single dict (legacy) and a list of dicts (new format).
    Deduplicates by (source_name, source_link, author_name) to avoid collapsing
    different sources that share the same name.
    """
    seen: set[tuple] = set()
    attribution_lines: list[str] = []

    def _add_details(details: dict) -> None:
        if not details:
            return
        key = (details.get("source_name"), details.get("source_link"), details.get("author_name"))
        if key in seen:
            return
        seen.add(key)
        line = _format_source_attribution(details)
        if line:
            attribution_lines.append(line)

    def _process_details_field(details_raw) -> None:
        """Handle details as a list of dicts or a single dict."""
        if isinstance(details_raw, list):
            for d in details_raw:
                if isinstance(d, dict):
                    _add_details(d)
        elif isinstance(details_raw, dict):
            _add_details(details_raw)

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

    if not attribution_lines:
        return ""

    # Header and prefixes are fixed English strings by design.
    return f"{SOURCES_HEADER_EN}\n\n" + "\n\n".join(attribution_lines)


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

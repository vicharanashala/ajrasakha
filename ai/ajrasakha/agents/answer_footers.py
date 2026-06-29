"""Deterministic farmer-facing footers — sources, 2-hour, testing disclaimer.

Never passed through the translate LLM; keyed by (script_language, vocal_language).
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.translation_catalog import (
    get_non_agriculture_reply,
    get_testing_disclaimer,
    get_two_hour_disclaimer,
    get_late_night_disclaimer,
    get_early_morning_disclaimer,
    synthesis_lang_label,
)

# IST timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

FOOTER_SEPARATOR = "_____________________________"


def get_time_aware_expert_disclaimer(script_language: str, vocal_language: str) -> str:
    """Return the appropriate expert queue disclaimer based on current IST time.

    - 10:01 PM - 11:59 PM (hour 22-23): use sheet-localized late night disclaimer
    - 12:00 AM - 5:59 AM (hour 0-5): use sheet-localized early morning disclaimer
    - Otherwise: use the sheet-localized 2-hour disclaimer
    """
    now_ist = datetime.now(IST)
    hour = now_ist.hour

    # Scenario 1: 10:01 PM - 11:59 PM (hours 22-23)
    if 22 <= hour <= 23:
        return get_late_night_disclaimer(script_language, vocal_language)

    # Scenario 2: 12:00 AM - 5:59 AM (hours 0-5)
    if 0 <= hour <= 5:
        return get_early_morning_disclaimer(script_language, vocal_language)

    # Default: use sheet-localized 2-hour disclaimer
    return get_two_hour_disclaimer(script_language, vocal_language)


SOURCES_HEADER_EN = "📚 Sources:"
EXPERT_PREFIX_EN = "👤 Answered by:"
SOURCE_LINK_PREFIX = "🔗"

_AJRASAKHA_MARKDOWN_SOURCES = frozenset({"ajrasakha", "ajrasakha_webapp"})


def is_ajrasakha_markdown_source_client(question_source: str | None) -> bool:
    """True when GDB sources should render as markdown links for the client."""
    if not question_source:
        return False
    return question_source.strip().lower() in _AJRASAKHA_MARKDOWN_SOURCES


def _is_unnamed_source(source_name: object) -> bool:
    name = (source_name or "").strip()
    if not name:
        return True
    return name.lower() == "database document"


def _source_display_name(
    source_name: object,
    *,
    unnamed_index: int,
    total_unnamed: int,
) -> str:
    if not _is_unnamed_source(source_name):
        return str(source_name).strip()
    if total_unnamed <= 1:
        return "source"
    return f"source_{unnamed_index}"


def _format_source_line(
    details: dict,
    *,
    question_source: str | None = None,
    unnamed_index: int = 1,
    total_unnamed: int = 1,
) -> str:
    """Format one source line — markdown for AjraSakha clients, plain text otherwise."""
    source_name = details.get("source_name")
    source_link = (details.get("source_link") or "").strip()

    if is_ajrasakha_markdown_source_client(question_source):
        if source_link:
            label = _source_display_name(
                source_name,
                unnamed_index=unnamed_index,
                total_unnamed=total_unnamed,
            )
            return f"[{label}]({source_link})"
        if source_name and not _is_unnamed_source(source_name):
            return f"[{str(source_name).strip()}]()"
        return ""

    is_db_doc = _is_unnamed_source(source_name)

    if is_db_doc or not source_name:
        if source_link:
            return f"{SOURCE_LINK_PREFIX} {source_link}"
    elif source_name and source_link:
        return f"{SOURCE_LINK_PREFIX} {source_name}: {source_link}"
    elif source_name:
        return f"{SOURCE_LINK_PREFIX} {source_name}"
    elif source_link:
        return f"{SOURCE_LINK_PREFIX} {source_link}"

    return ""


def _append_footer_block(body: str, footer_parts: list[str]) -> str:
    """Join body and footer sections with the separator line."""
    parts = [part.strip() for part in footer_parts if part and part.strip()]
    if not parts:
        return (body or "").strip()
    footer = "\n\n".join(parts)
    out = (body or "").strip()
    if not out:
        return footer
    return f"{out}\n\n{FOOTER_SEPARATOR}\n\n{footer}"


def collect_all_sources(
    gdb_data: dict,
    *,
    question_source: str | None = None,
) -> str:
    """Collect source attribution (English-only) from exact match and all similar pairs.

    Handles details as both a single dict (legacy) and a list of dicts (new format).
    - Collects unique authors separately (deduplicated)
    - Collects unique sources separately (deduplicated)
    Output format:
        👤 Answered by: Author1, Author2

        📚 Sources:
        [source](https://link)   — AjraSakha clients
        🔗 SourceName: https://link   — other channels
    """
    seen_sources: set[tuple] = set()
    seen_authors: set[str] = set()
    source_entries: list[dict] = []
    author_names: list[str] = []

    def _process_details(details: dict) -> None:
        if not details:
            return

        source_name = details.get("source_name")
        source_link = details.get("source_link")
        author_name = details.get("author_name")

        source_key = (source_name, source_link)
        if source_key not in seen_sources:
            seen_sources.add(source_key)
            source_entries.append(details)

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

    unnamed_entries = [d for d in source_entries if _is_unnamed_source(d.get("source_name"))]
    total_unnamed = len(unnamed_entries)
    unnamed_counter = 0

    source_lines: list[str] = []
    for details in source_entries:
        unnamed_index = 1
        if _is_unnamed_source(details.get("source_name")):
            unnamed_counter += 1
            unnamed_index = unnamed_counter
        line = _format_source_line(
            details,
            question_source=question_source,
            unnamed_index=unnamed_index,
            total_unnamed=total_unnamed,
        )
        if line:
            source_lines.append(line)

    if not source_lines and not author_names:
        return ""

    parts: list[str] = []

    if author_names:
        authors_str = ", ".join(author_names)
        parts.append(f"{EXPERT_PREFIX_EN} {authors_str}")

    if source_lines:
        if parts:
            parts.append("")
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
    return _append_footer_block(body, [testing])


def build_non_agriculture_content(script_language: str, vocal_language: str) -> str:
    """Exact sheet reply followed by the localized testing disclaimer."""
    body = get_non_agriculture_reply(script_language, vocal_language)
    testing = get_testing_disclaimer(script_language, vocal_language)
    if not testing.strip():
        raise ValueError(
            "Translation catalogue configuration error: Testing disclaimer must "
            f"not be blank for ({script_language}, {vocal_language})"
        )
    return f"{body}\n\n{FOOTER_SEPARATOR}\n\n{testing}"


def finalize_synthesis_answer(
    body: str,
    *,
    script_language: str,
    vocal_language: str,
    gdb_data: Optional[dict],
    is_greeting: bool = False,
    question_source: str | None = None,
) -> str:
    """Synthesize path: translated body → separator → GDB sources → testing disclaimer."""
    out = (body or "").strip()
    if not out:
        return out
    if is_greeting:
        return out

    footer_parts: list[str] = []
    if gdb_data and gdb_has_usable_answers(gdb_data):
        source_block = collect_all_sources(gdb_data, question_source=question_source)
        if source_block:
            footer_parts.append(source_block)

    testing = get_testing_disclaimer(script_language, vocal_language)
    if testing.strip():
        footer_parts.append(testing)

    if not footer_parts:
        return out
    return _append_footer_block(out, footer_parts)


# Backward-compatible alias
finalize_farmer_answer = finalize_synthesis_answer

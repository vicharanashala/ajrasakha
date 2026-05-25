"""Deterministic farmer-facing footers — sources, 2-hour, testing disclaimer.

Never passed through the translate LLM; keyed by (script_language, vocal_language).
"""

from __future__ import annotations

from typing import Optional

from ajrasakha.agents.language import (
    get_localized_expert_prefix,
    get_localized_source_prefix,
    get_localized_sources_header,
)
from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.translation_catalog import (
    get_testing_disclaimer,
    get_two_hour_disclaimer,
    synthesis_lang_label,
)


def _format_source_attribution(details: dict, lang_label: str = "English") -> str:
    """Format source name (with embedded link) + author name for final output."""
    lines: list[str] = []
    source_name = details.get("source_name")
    source_link = details.get("source_link")
    author_name = details.get("author_name")

    src_prefix = get_localized_source_prefix(lang_label)
    exp_prefix = get_localized_expert_prefix(lang_label)

    if source_name and source_link:
        lines.append(f"{src_prefix} {source_name} ({source_link})")
    elif source_name:
        lines.append(f"{src_prefix} {source_name}")
    elif source_link:
        lines.append(f"{src_prefix} {source_link}")

    if author_name:
        lines.append(f"{exp_prefix} {author_name}")

    return "\n".join(lines)


def collect_all_sources(gdb_data: dict, lang_label: str = "English") -> str:
    """Collect source attribution from exact match and all similar pairs."""
    seen: set[tuple] = set()
    attribution_lines: list[str] = []

    def _add_details(details: dict) -> None:
        if not details:
            return
        key = (details.get("source_name"), details.get("author_name"))
        if key in seen:
            return
        seen.add(key)
        line = _format_source_attribution(details, lang_label)
        if line:
            attribution_lines.append(line)

    exact = gdb_data.get("exact_match") or {}
    if (exact.get("answer") or "").strip():
        _add_details(exact.get("details") or {})

    for i in range(1, 6):
        pair = gdb_data.get(f"similar_pair{i}")
        if (
            pair
            and isinstance(pair, dict)
            and (pair.get("answer") or "").strip()
        ):
            _add_details(pair.get("details") or {})

    if not attribution_lines:
        return ""

    header = get_localized_sources_header(lang_label)
    return header + "\n\n".join(attribution_lines)


def build_expert_queue_content(script_language: str, vocal_language: str) -> str:
    """Sheet-localized 2-hour expert-queue text + testing disclaimer (no LLM)."""
    body = get_two_hour_disclaimer(script_language, vocal_language)
    testing = get_testing_disclaimer(script_language, vocal_language)
    return f"{body}\n\n{testing}"


def finalize_farmer_answer(
    body: str,
    *,
    script_language: str,
    vocal_language: str,
    gdb_data: Optional[dict],
) -> str:
    """After translate: body → GDB sources (author) → testing disclaimer from sheet."""
    out = (body or "").strip()
    if not out:
        return out
    lang_label = synthesis_lang_label(script_language, vocal_language)
    if gdb_data and gdb_has_usable_answers(gdb_data):
        source_block = collect_all_sources(gdb_data, lang_label)
        if source_block:
            out = f"{out}\n{source_block}"
    testing = get_testing_disclaimer(script_language, vocal_language)
    if testing.strip():
        return f"{out}\n\n{testing}"
    return out

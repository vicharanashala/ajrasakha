"""Tests for GDB source parsing and link-only footer formatting."""

from __future__ import annotations

from ajrasakha.agents.answer_footers import collect_all_sources
from ajrasakha.tools.golden.golden_rag_tool import _parse_sources


def test_parse_sources_link_only_no_database_document():
    details = _parse_sources(
        ["https://workdrive.zohoexternal.in/file/abc123"],
        "Aditya Kumar",
    )
    assert len(details) == 1
    assert details[0]["source_name"] is None
    assert "zohoexternal" in details[0]["source_link"]
    assert details[0]["author_name"] == "Aditya Kumar"


def test_parse_sources_named_source_unchanged():
    details = _parse_sources(
        [
            {
                "source_name": "PAU Handbook",
                "source_link": "https://example.edu/doc",
            }
        ],
        "Expert A",
    )
    assert details[0]["source_name"] == "PAU Handbook"
    assert details[0]["source_link"] == "https://example.edu/doc"


def test_parse_sources_empty_sources_expert_only():
    details = _parse_sources([], "Divyadarshni")
    assert len(details) == 1
    assert details[0]["source_name"] is None
    assert details[0]["source_link"] == ""
    assert details[0]["author_name"] == "Divyadarshni"


def test_collect_all_sources_link_only_footer():
    gdb_data = {
        "is_exact": True,
        "exact_match": {
            "question": "Q",
            "answer": "Grow barley with care.",
            "details": {
                "source_name": None,
                "source_link": "https://workdrive.zohoexternal.in/file/xyz",
                "author_name": "Aditya Kumar",
            },
        },
    }
    block = collect_all_sources(gdb_data)
    assert "https://workdrive.zohoexternal.in/file/xyz" in block
    assert "Aditya Kumar" in block
    assert "Database Document" not in block
    assert "📚 Source: https://" in block


def test_collect_all_sources_legacy_database_document_treated_as_link_only():
    """Old GDB JSON in thread state should not show placeholder name."""
    gdb_data = {
        "is_exact": True,
        "exact_match": {
            "question": "Q",
            "answer": "Answer text.",
            "details": {
                "source_name": "Database Document",
                "source_link": "https://example.com/doc.pdf",
                "author_name": "Expert",
            },
        },
    }
    block = collect_all_sources(gdb_data)
    assert "https://example.com/doc.pdf" in block
    assert "Database Document" not in block

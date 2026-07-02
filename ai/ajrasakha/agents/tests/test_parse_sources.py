"""Tests for GDB source parsing and link-only footer formatting."""

from __future__ import annotations

from ajrasakha.agents.answer_footers import (
    FOOTER_SEPARATOR,
    collect_all_sources,
    finalize_synthesis_answer,
    is_ajrasakha_markdown_source_client,
)
from ajrasakha.tools.golden.golden_core import parse_sources as _parse_sources


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


def test_parse_sources_camelcase_source_name_from_mongodb():
    details = _parse_sources(
        [
            {
                "source": "https://workdrive.zohoexternal.in/file/abc123",
                "page": "116,119",
                "sourceType": "state",
                "sourceName": "MPKV",
            }
        ],
        "Sippora Nandam",
    )
    assert details[0]["source_name"] == "MPKV"
    assert "zohoexternal" in details[0]["source_link"]
    assert details[0]["author_name"] == "Sippora Nandam"


def test_parse_sources_empty_sources_expert_only():
    details = _parse_sources([], "Divyadarshni")
    assert len(details) == 1
    assert details[0]["source_name"] is None
    assert details[0]["source_link"] == ""
    assert details[0]["author_name"] == "Divyadarshni"


def test_is_ajrasakha_markdown_source_client():
    assert is_ajrasakha_markdown_source_client("AJRASAKHA") is True
    assert is_ajrasakha_markdown_source_client("AJRASAKHA_WEBAPP") is True
    assert is_ajrasakha_markdown_source_client("ajrasakha_webapp") is True
    assert is_ajrasakha_markdown_source_client("WHATSAPP") is False
    assert is_ajrasakha_markdown_source_client(None) is False


def test_collect_all_sources_link_only_footer_whatsapp():
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
    block = collect_all_sources(gdb_data, question_source="WHATSAPP")
    assert "https://workdrive.zohoexternal.in/file/xyz" in block
    assert "Aditya Kumar" in block
    assert "Database Document" not in block
    assert "📚 Sources:" in block
    assert "🔗 https://workdrive.zohoexternal.in/file/xyz" in block


def test_collect_all_sources_link_only_footer_ajrasakha_markdown():
    gdb_data = {
        "is_exact": True,
        "exact_match": {
            "question": "Q",
            "answer": "Grow barley with care.",
            "details": {
                "source_name": None,
                "source_link": "https://workdrive.zohoexternal.in/file/xyz",
                "author_name": "Dheeraj Sharma",
            },
        },
    }
    block = collect_all_sources(gdb_data, question_source="AJRASAKHA")
    assert "[source](https://workdrive.zohoexternal.in/file/xyz)" in block
    assert "Dheeraj Sharma" in block
    assert "🔗" not in block


def test_collect_all_sources_named_source_ajrasakha_markdown():
    gdb_data = {
        "is_exact": True,
        "exact_match": {
            "question": "Q",
            "answer": "Answer text.",
            "details": {
                "source_name": "PAU Handbook",
                "source_link": "https://example.edu/doc",
                "author_name": "Expert",
            },
        },
    }
    block = collect_all_sources(gdb_data, question_source="AJRASAKHA_WEBAPP")
    assert "[PAU Handbook](https://example.edu/doc)" in block


def test_collect_all_sources_multiple_unnamed_ajrasakha_markdown():
    gdb_data = {
        "is_exact": True,
        "exact_match": {
            "question": "Q",
            "answer": "Answer text.",
            "details": [
                {
                    "source_name": None,
                    "source_link": "https://example.com/1",
                    "author_name": "Expert",
                },
                {
                    "source_name": "Database Document",
                    "source_link": "https://example.com/2",
                    "author_name": "Expert",
                },
            ],
        },
    }
    block = collect_all_sources(gdb_data, question_source="AJRASAKHA")
    assert "[source_1](https://example.com/1)" in block
    assert "[source_2](https://example.com/2)" in block


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
    block = collect_all_sources(gdb_data, question_source="WHATSAPP")
    assert "https://example.com/doc.pdf" in block
    assert "Database Document" not in block
    assert "🔗 https://example.com/doc.pdf" in block


def test_finalize_synthesis_answer_includes_separator():
    body = "Grow barley with proper irrigation."
    result = finalize_synthesis_answer(
        body,
        script_language="English",
        vocal_language="English",
        gdb_data=None,
        question_source="AJRASAKHA",
    )
    assert body in result
    assert FOOTER_SEPARATOR in result
    assert result.index(FOOTER_SEPARATOR) > result.index(body)

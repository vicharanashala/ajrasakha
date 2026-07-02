"""Regression: no source-only footer when sanitizer drops all pair answers."""

from __future__ import annotations

import json

from langchain_core.messages import HumanMessage, ToolMessage

from ajrasakha.agents.plan_executor import route_after_execute
from ajrasakha.agents.retrieval_sanitizer import gdb_has_usable_answers
from ajrasakha.agents.answer_footers import collect_all_sources
from ajrasakha.agents.state import AjraSakhaState


def _gdb_details_only_payload() -> dict:
    """Pairs retain metadata but no answers (post-sanitizer empty retrieval)."""
    return {
        "is_exact": False,
        "is_similar": False,
        "similar_pair1": {
            "question": "Q1",
            "answer": "",
            "details": {
                "source_name": "Database Document",
                "source_link": "https://example.com/1",
                "author_name": "Jayashree",
            },
        },
        "similar_pair2": {
            "question": "Q2",
            "answer": "",
            "details": {
                "source_name": "Database Document",
                "source_link": "https://example.com/2",
                "author_name": "Suresh",
            },
        },
    }


def test_gdb_has_usable_answers_false_when_only_details():
    assert gdb_has_usable_answers(_gdb_details_only_payload()) is False


def testcollect_all_sources_empty_when_no_answers():
    assert collect_all_sources(_gdb_details_only_payload()) == ""


def testcollect_all_sources_only_for_pairs_with_answers():
    data = {
        "is_exact": False,
        "is_similar": True,
        "similar_pair1": {
            "question": "Q1",
            "answer": "Expert answer one.",
            "details": {
                "source_name": "PAU",
                "source_link": "https://example.com/a",
                "author_name": "Expert A",
            },
        },
        "similar_pair2": {
            "question": "Q2",
            "answer": "",
            "details": {
                "source_name": "Other",
                "source_link": "https://example.com/b",
                "author_name": "Expert B",
            },
        },
    }
    block = collect_all_sources(data)
    assert "Expert A" in block
    assert "Expert B" not in block
    assert block.count("📚 Source") == 1


def test_route_after_execute_empty_when_all_answers_dropped():
    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="Crop advice?"),
            ToolMessage(
                content=json.dumps(_gdb_details_only_payload()),
                tool_call_id="c1",
                name="gdb",
            ),
        ],
        "plan": {"knowledge_base": True},
    }
    assert route_after_execute(state) == "empty_gdb_reply"


def test_route_after_execute_assemble_when_weather_tool_has_content():
    """Empty GDB + weather answer → assemble_answer_body from specialist tools."""
    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="Weather and crop?"),
            ToolMessage(
                content=json.dumps(_gdb_details_only_payload()),
                tool_call_id="c1",
                name="gdb",
            ),
            ToolMessage(content="Forecast: hot", tool_call_id="w1", name="weather"),
        ],
        "plan": {"knowledge_base": True, "weather": True},
    }
    assert route_after_execute(state) == "assemble_answer_body"

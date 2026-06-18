"""Tests for deterministic translate_answer paths (empty_gdb vs synthesis)."""

from __future__ import annotations

import json

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from ajrasakha.agents.answer_footers import FOOTER_SEPARATOR, build_expert_queue_content
from ajrasakha.agents.prompts import EXPERT_QUEUE_REPLY_MARKER
from ajrasakha.agents.state import TRANSLATE_PATH_EMPTY_GDB
from ajrasakha.agents.translate_answer import translate_answer_node
from ajrasakha.agents.translation_catalog import get_testing_disclaimer


def _gdb_with_answer() -> dict:
    return {
        "is_exact": True,
        "exact_match": {
            "question": "Q",
            "answer": "Grow barley with proper irrigation.",
            "details": {
                "source_name": "PAU",
                "source_link": "https://example.edu",
                "author_name": "Expert",
            },
        },
    }


def test_empty_gdb_path_sheet_only():
    state = {
        "messages": [
            HumanMessage(content="Unknown crop question?"),
            AIMessage(content=""),
        ],
        "plan": {
            "translate_path": TRANSLATE_PATH_EMPTY_GDB,
            "vocal_language": "English",
            "script_language": "English",
        },
    }
    import asyncio

    result = asyncio.run(translate_answer_node(state, {}))
    text = result["messages"][0].content
    expected = build_expert_queue_content("English", "English")
    assert text == expected
    assert FOOTER_SEPARATOR in text
    assert EXPERT_QUEUE_REPLY_MARKER in text
    assert "Growing barley" not in text


def test_synthesis_path_body_sources_testing_no_two_hour():
    synthesis_body = "Growing barley in Punjab requires careful planning."
    state = {
        "messages": [
            HumanMessage(content="How to grow barley?"),
            AIMessage(content="", tool_calls=[{"id": "c1", "name": "gdb", "args": {}}]),
            ToolMessage(
                content=json.dumps(_gdb_with_answer()),
                tool_call_id="c1",
                name="gdb",
            ),
            AIMessage(content=synthesis_body),
        ],
        "plan": {
            "translate_path": None,
            "expert_queue": True,
            "vocal_language": "English",
            "script_language": "English",
        },
    }
    import asyncio

    result = asyncio.run(translate_answer_node(state, {}))
    text = result["messages"][0].content
    assert synthesis_body in text
    assert FOOTER_SEPARATOR in text
    assert text.index(FOOTER_SEPARATOR) > text.index(synthesis_body)
    assert "PAU" in text
    assert "Expert" in text
    assert get_testing_disclaimer("English", "English") in text
    assert EXPERT_QUEUE_REPLY_MARKER not in text


def test_stale_expert_queue_flag_uses_synthesis_path():
    """expert_queue=True without translate_path=empty_gdb must not drop synthesis body."""
    synthesis_body = "Full advisory text from synthesizer."
    state = {
        "messages": [HumanMessage(content="Q"), AIMessage(content=synthesis_body)],
        "plan": {
            "expert_queue": True,
            "vocal_language": "English",
            "script_language": "English",
        },
    }
    import asyncio

    result = asyncio.run(translate_answer_node(state, {}))
    text = result["messages"][0].content
    assert synthesis_body in text
    assert FOOTER_SEPARATOR in text
    assert EXPERT_QUEUE_REPLY_MARKER not in text

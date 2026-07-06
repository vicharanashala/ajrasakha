"""Tests for the deterministic non-agriculture terminal node."""

from __future__ import annotations

from unittest.mock import Mock

import pytest
from langchain_core.messages import AIMessage

import ajrasakha.agents.non_agriculture_reply as reply_module
from ajrasakha.agents.answer_footers import (
    FOOTER_SEPARATOR,
    build_non_agriculture_content,
)
from ajrasakha.agents.translation_catalog import (
    get_non_agriculture_reply,
    get_testing_disclaimer,
    get_two_hour_disclaimer,
)


def test_build_non_agriculture_content_uses_exact_catalog_blocks():
    body = get_non_agriculture_reply("English", "English")
    testing = get_testing_disclaimer("English", "English")

    assert build_non_agriculture_content("English", "English") == (
        f"{body}\n\n{FOOTER_SEPARATOR}\n\n{testing}"
    )


def test_build_non_agriculture_content_does_not_append_two_hour_disclaimer():
    content = build_non_agriculture_content("English", "English")
    two_hour = get_two_hour_disclaimer("English", "English")

    assert "Important Notice (Testing)" in content
    assert two_hour not in content
    assert "Answered by:" not in content


def test_catalog_contains_native_and_romanized_non_agriculture_replies():
    native = get_non_agriculture_reply("Devanagari", "Hindi")
    romanized = get_non_agriculture_reply("English", "Hindi")

    assert native.strip()
    assert romanized.strip()
    assert native != romanized


@pytest.mark.asyncio
async def test_node_uses_plan_pair_preserves_location_and_completes_turn(monkeypatch):
    expected = "Exact reply\nwith line breaks\n\n_____________________________\n\nTesting notice"
    seen_pair: list[tuple[str, str]] = []

    def fake_build(script: str, vocal: str) -> str:
        seen_pair.append((script, vocal))
        return expected

    end_turn = Mock()
    trace = Mock()
    monkeypatch.setattr(reply_module, "build_non_agriculture_content", fake_build)
    monkeypatch.setattr(reply_module, "end_conversation_turn", end_turn)
    monkeypatch.setattr(reply_module, "trace_event", trace)

    location = {"state": "Assam", "city": "Guwahati"}
    result = await reply_module.non_agriculture_reply_node(
        {
            "messages": [],
            "plan": {
                "script_language": "English",
                "vocal_language": "Assamese",
            },
            "location": location,
        }
    )

    assert seen_pair == [("English", "Assamese")]
    assert result["location"] == location
    assert len(result["messages"]) == 1
    assert isinstance(result["messages"][0], AIMessage)
    assert result["messages"][0].content == expected
    end_turn.assert_called_once_with(expected, outcome="non_agriculture")
    trace.assert_called_once_with(
        "non_agriculture_reply",
        script_language="English",
        vocal_language="Assamese",
    )

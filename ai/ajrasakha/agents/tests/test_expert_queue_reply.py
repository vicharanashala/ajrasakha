"""Tests for empty GDB + no specialist tools → expert-queue canned reply."""

from __future__ import annotations

import json

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from ajrasakha.agents.ajrasakha import empty_gdb_reply_node
from ajrasakha.agents.plan_executor import (
    route_after_sanitizer,
    should_expert_queue_reply,
)
from ajrasakha.agents.prompts import EMPTY_GDB_REPLY, EXPERT_QUEUE_REPLY_MARKER, WARNING_TEXT
from ajrasakha.agents.state import AjraSakhaState


def _gdb_json(**overrides) -> str:
    base = {
        "is_exact": False,
        "is_similar": False,
        "similar_pair1": {"question": "Q1", "answer": "A1"},
    }
    base.update(overrides)
    return json.dumps(base)


def _state_after_sanitizer_filter() -> AjraSakhaState:
    """GDB with all similar pairs removed by sanitizer."""
    return {
        "messages": [
            HumanMessage(content="How to grow barley in Punjab?"),
            AIMessage(content="", tool_calls=[{"id": "c1", "name": "gdb", "args": {}}]),
            ToolMessage(
                content=json.dumps({"is_exact": False, "is_similar": False}),
                tool_call_id="c1",
                name="gdb",
            ),
        ],
        "plan": {
            "knowledge_base": True,
            "weather": False,
            "mandi": False,
            "soil": False,
            "schemes": False,
            "chemical_checker": False,
        },
    }


def test_should_expert_queue_when_gdb_empty_no_specialists():
    assert should_expert_queue_reply(_state_after_sanitizer_filter()) is True


def test_should_not_expert_queue_when_weather_in_plan():
    state = _state_after_sanitizer_filter()
    state["plan"] = {**state["plan"], "weather": True}
    assert should_expert_queue_reply(state) is False


def test_should_not_expert_queue_when_gdb_has_similar_pair():
    state = _state_after_sanitizer_filter()
    state["messages"] = [
        HumanMessage(content="Barley?"),
        ToolMessage(content=_gdb_json(is_similar=True), tool_call_id="c1", name="gdb"),
    ]
    assert should_expert_queue_reply(state) is False


def test_route_after_sanitizer_to_empty_gdb_reply():
    assert route_after_sanitizer(_state_after_sanitizer_filter()) == "empty_gdb_reply"


def test_route_after_sanitizer_to_synthesize_with_weather():
    state = _state_after_sanitizer_filter()
    state["plan"] = {**state["plan"], "weather": True}
    state["messages"].append(
        ToolMessage(content="Rain expected tomorrow", tool_call_id="w1", name="weather")
    )
    assert route_after_sanitizer(state) == "synthesize"


def test_empty_gdb_reply_content():
    result = empty_gdb_reply_node(_state_after_sanitizer_filter())
    text = result["messages"][0].content
    assert EXPERT_QUEUE_REPLY_MARKER in text
    assert "Thank You." in text
    assert "Important Notice (Testing)" in text
    assert WARNING_TEXT.strip() in text
    assert text == EMPTY_GDB_REPLY

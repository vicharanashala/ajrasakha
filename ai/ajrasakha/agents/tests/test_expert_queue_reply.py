"""Tests for empty GDB + no specialist tools → expert-queue canned reply."""

from __future__ import annotations

import json

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from ajrasakha.agents.ajrasakha import (
    empty_gdb_reply_node,
    route_after_translate_answer,
)
from ajrasakha.agents.plan_executor import (
    route_after_execute,
    should_expert_queue_reply,
)
from ajrasakha.agents.prompts import EXPERT_QUEUE_REPLY_MARKER
from ajrasakha.agents.answer_footers import FOOTER_SEPARATOR, build_expert_queue_content
from ajrasakha.agents.state import TRANSLATE_PATH_EMPTY_GDB
from ajrasakha.agents.translate_answer import translate_answer_node
from ajrasakha.agents.translation_catalog import (
    get_testing_disclaimer,
    get_two_hour_disclaimer,
)
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


def test_should_not_expert_queue_when_weather_tool_has_content():
    state = _state_after_sanitizer_filter()
    state["plan"] = {**state["plan"], "weather": True}
    state["messages"].append(
        ToolMessage(content="Rain expected tomorrow", tool_call_id="w1", name="weather")
    )
    assert should_expert_queue_reply(state) is False


def test_should_not_expert_queue_when_gdb_has_similar_pair():
    state = _state_after_sanitizer_filter()
    state["messages"] = [
        HumanMessage(content="Barley?"),
        ToolMessage(content=_gdb_json(is_similar=True), tool_call_id="c1", name="gdb"),
    ]
    assert should_expert_queue_reply(state) is False


def test_route_after_execute_to_empty_gdb_reply():
    assert route_after_execute(_state_after_sanitizer_filter()) == "empty_gdb_reply"


def test_route_after_execute_empty_when_weather_planned_but_no_tool_content():
    """Planner requested weather but tool returned nothing — still expert-queue."""
    state = _state_after_sanitizer_filter()
    state["plan"] = {**state["plan"], "weather": True}
    assert route_after_execute(state) == "empty_gdb_reply"


def test_route_after_execute_assemble_when_weather_has_content():
    """Empty GDB + non-empty weather tool → assemble_answer_body (not expert-queue)."""
    state = _state_after_sanitizer_filter()
    state["plan"] = {**state["plan"], "weather": True}
    state["messages"].append(
        ToolMessage(content="Rain expected tomorrow", tool_call_id="w1", name="weather")
    )
    assert route_after_execute(state) == "assemble_answer_body"


def test_final_langgraph_and_expert_reviewed_answers_are_shortened():
    assert route_after_translate_answer({"plan": {}}) == "answer_shortener"
    assert (
        route_after_translate_answer({"plan": {"skip_synthesize": True}})
        == "answer_shortener"
    )


def test_expert_queue_reply_is_not_sent_to_answer_shortener():
    assert (
        route_after_translate_answer(
            {"plan": {"translate_path": TRANSLATE_PATH_EMPTY_GDB}}
        )
        == "end"
    )


async def test_empty_gdb_reply_sets_translate_path():
    result = await empty_gdb_reply_node(_state_after_sanitizer_filter())
    assert result["messages"][0].content == ""
    assert result["plan"].get("translate_path") == TRANSLATE_PATH_EMPTY_GDB


async def test_translate_answer_empty_gdb_path_content():
    state = _state_after_sanitizer_filter()
    placeholder = await empty_gdb_reply_node(state)
    merged = {**state, **placeholder}
    result = await translate_answer_node(merged, {})
    text = result["messages"][0].content
    assert EXPERT_QUEUE_REPLY_MARKER in text
    assert "Thank You." in text
    expected = build_expert_queue_content("English", "English")
    assert text == expected
    assert text == (
        f"{get_two_hour_disclaimer('English', 'English')}\n\n"
        f"{FOOTER_SEPARATOR}\n\n"
        f"{get_testing_disclaimer('English', 'English')}"
    )

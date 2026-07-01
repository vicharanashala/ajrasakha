"""Tests for the deterministic weather-unavailable terminal path."""

from __future__ import annotations

import json
from unittest.mock import Mock

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

import ajrasakha.agents.weather_unavailable_reply as reply_module
from ajrasakha.agents.answer_footers import (
    FOOTER_SEPARATOR,
    build_weather_unavailable_content,
)
from ajrasakha.agents.plan_executor import (
    compute_actual_tools_used,
    route_after_execute,
    turn_has_unavailable_weather,
)
from ajrasakha.agents.state import AjraSakhaState
from ajrasakha.agents.translation_catalog import (
    get_testing_disclaimer,
    get_two_hour_disclaimer,
    get_weather_unavailable_reply,
)


def _state_with_weather(content: str, *, weather: bool = True) -> AjraSakhaState:
    return {
        "messages": [
            HumanMessage(content="What is the weather in Delhi now?"),
            ToolMessage(content=content, tool_call_id="w1", name="weather"),
        ],
        "plan": {
            "weather": weather,
            "knowledge_base": False,
            "script_language": "English",
            "vocal_language": "English",
        },
    }


def test_build_weather_unavailable_content_uses_exact_catalog_blocks():
    body = get_weather_unavailable_reply("English", "English")
    testing = get_testing_disclaimer("English", "English")

    assert build_weather_unavailable_content("English", "English") == (
        f"{body}\n\n{FOOTER_SEPARATOR}\n\n{testing}"
    )


def test_build_weather_unavailable_content_excludes_expert_queue_text():
    content = build_weather_unavailable_content("English", "English")

    assert get_two_hour_disclaimer("English", "English") not in content
    assert content.endswith(get_testing_disclaimer("English", "English"))


def test_catalog_contains_native_and_romanized_weather_replies():
    native = get_weather_unavailable_reply("Devanagari", "Hindi")
    romanized = get_weather_unavailable_reply("English", "Hindi")

    assert native.strip()
    assert romanized.strip()
    assert native != romanized


@pytest.mark.parametrize(
    "content",
    [
        "",
        json.dumps({"success": False, "error": "Weather unavailable"}),
        json.dumps(
            {
                "success": True,
                "data_type": "current_aws",
                "result": {"success": False, "error": "No nearby station"},
            }
        ),
    ],
)
def test_weather_failure_shapes_route_to_terminal_reply(content: str):
    state = _state_with_weather(content)

    assert turn_has_unavailable_weather(state["messages"]) is True
    assert route_after_execute(state) == "weather_unavailable_reply"


def test_successful_weather_keeps_existing_assemble_route():
    state = _state_with_weather(
        json.dumps(
            {
                "success": True,
                "data_type": "current_aws",
                "result": {"success": True, "station": {"name": "Delhi"}},
            }
        )
    )

    assert turn_has_unavailable_weather(state["messages"]) is False
    assert route_after_execute(state) == "assemble_answer_body"


def test_weather_failure_requires_planner_weather_flag():
    state = _state_with_weather(
        json.dumps({"success": False, "error": "Weather unavailable"}),
        weather=False,
    )

    assert route_after_execute(state) == "empty_gdb_reply"


def test_prior_turn_weather_failure_is_ignored():
    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="Weather in Delhi?"),
            ToolMessage(content="", tool_call_id="old-w", name="weather"),
            HumanMessage(content="How should I grow wheat?"),
            ToolMessage(
                content=json.dumps({"is_exact": False, "is_similar": False}),
                tool_call_id="g1",
                name="gdb",
            ),
        ],
        "plan": {"weather": True, "knowledge_base": True},
    }

    assert turn_has_unavailable_weather(state["messages"]) is False
    assert route_after_execute(state) == "empty_gdb_reply"


def test_weather_failure_wins_for_mixed_weather_and_gdb_query():
    state = _state_with_weather(json.dumps({"success": False, "error": "No data"}))
    state["messages"].append(
        ToolMessage(
            content=json.dumps(
                {
                    "is_exact": True,
                    "is_similar": False,
                    "exact_match": {"answer": "Static crop advice"},
                }
            ),
            tool_call_id="g1",
            name="gdb",
        )
    )
    state["plan"] = {**state["plan"], "knowledge_base": True}

    assert route_after_execute(state) == "weather_unavailable_reply"


def test_failed_weather_is_not_recorded_as_useful_tool_data():
    state = _state_with_weather(
        json.dumps({"success": False, "error": "Weather unavailable"})
    )

    assert compute_actual_tools_used(state["messages"]) == []


@pytest.mark.asyncio
async def test_node_uses_plan_language_preserves_location_and_completes_turn(
    monkeypatch,
):
    expected = "Exact weather reply\n\n_____________________________\n\nTesting notice"
    seen_pair: list[tuple[str, str]] = []

    def fake_build(script: str, vocal: str) -> str:
        seen_pair.append((script, vocal))
        return expected

    end_turn = Mock()
    trace = Mock()
    monkeypatch.setattr(reply_module, "build_weather_unavailable_content", fake_build)
    monkeypatch.setattr(reply_module, "end_conversation_turn", end_turn)
    monkeypatch.setattr(reply_module, "trace_event", trace)

    location = {"state": "Assam", "city": "Guwahati"}
    result = await reply_module.weather_unavailable_reply_node(
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
    end_turn.assert_called_once_with(expected, outcome="weather_unavailable")
    trace.assert_called_once_with(
        "weather_unavailable_reply",
        script_language="English",
        vocal_language="Assamese",
    )

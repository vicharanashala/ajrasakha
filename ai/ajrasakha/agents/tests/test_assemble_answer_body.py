"""Tests for assemble_answer_body node (deterministic body assembly, no LLM)."""

from __future__ import annotations

import json

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from ajrasakha.agents.assemble_answer_body import assemble_answer_body_node
from ajrasakha.agents.state import AjraSakhaState, TRANSLATE_PATH_EMPTY_GDB


def _gdb_json(**overrides) -> str:
    base = {
        "is_exact": True,
        "is_similar": False,
        "exact_match": {"question": "Q", "answer": "Expert wheat guide."},
    }
    base.update(overrides)
    return json.dumps(base)


@pytest.mark.asyncio
async def test_assemble_answer_body_tool_only_sets_ai_message():
    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="Weather in Punjab?"),
            AIMessage(content="", tool_calls=[{"id": "call_w", "name": "weather", "args": {}}]),
            ToolMessage(
                content=json.dumps({
                    "success": True,
                    "data_type": "forecast",
                    "result": {
                        "success": True,
                        "today": {
                            "station": "Ludhiana",
                            "date": "2026-06-06",
                            "forecast": "Rain expected",
                            "forecast_min_temp": "22",
                            "forecast_max_temp": "30",
                            "distance_to_station_km": 8,
                        },
                        "forecast": [],
                    },
                }),
                tool_call_id="call_w",
                name="weather",
            ),
        ],
        "plan": {"weather": True},
    }
    result = await assemble_answer_body_node(state, {})
    assert len(result["messages"]) == 1
    assert isinstance(result["messages"][0], AIMessage)
    assert "Rain expected" in result["messages"][0].content
    assert result["plan"].get("gdb_has_data") is False


@pytest.mark.asyncio
async def test_assemble_answer_body_gdb_only_sets_expert_text():
    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="Wheat?"),
            ToolMessage(content=_gdb_json(), tool_call_id="c1", name="gdb"),
        ],
        "plan": {},
    }
    result = await assemble_answer_body_node(state, {})
    assert result["messages"][0].content == "Expert wheat guide."
    assert result["plan"].get("gdb_has_data") is True


@pytest.mark.asyncio
async def test_assemble_answer_body_mixed_gdb_and_weather_defer_empty():
    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="Wheat and weather?"),
            ToolMessage(content=_gdb_json(), tool_call_id="c1", name="gdb"),
            ToolMessage(content="Rain tomorrow", tool_call_id="w1", name="weather"),
        ],
        "plan": {},
    }
    result = await assemble_answer_body_node(state, {})
    assert result["messages"][0].content == ""
    assert result["plan"].get("translate_path") == TRANSLATE_PATH_EMPTY_GDB
    assert result["plan"].get("gdb_has_data") is False

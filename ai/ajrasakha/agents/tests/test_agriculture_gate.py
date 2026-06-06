"""Tests for is_agriculture_related gate and upload_reviewer_only routing."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from ajrasakha.agents.ajrasakha import graph, use_planner_graph
from ajrasakha.agents.plan_executor import build_reviewer_upload_calls, build_tool_calls_from_plan
from ajrasakha.agents.planner import route_after_ensure_location
from ajrasakha.agents.planner_rules import apply_non_agriculture_gate
from ajrasakha.agents.prompts import PLANNER_SYSTEM_PROMPT
from ajrasakha.agents.state import AjraSakhaState


def test_apply_non_agriculture_gate_clears_flags_and_forces_complete():
    plan = {
        "is_agriculture_related": False,
        "is_complete": False,
        "missing_info": ["crop"],
        "follow_up_question": "Which crop?",
        "weather": True,
        "mandi": True,
        "soil": True,
        "schemes": True,
        "knowledge_base": True,
        "chemical_checker": True,
    }
    out = apply_non_agriculture_gate(plan)
    assert out["is_complete"] is True
    assert out["missing_info"] == []
    assert out["follow_up_question"] is None
    assert out["weather"] is False
    assert out["mandi"] is False
    assert out["knowledge_base"] is False


def test_route_after_ensure_location_non_ag():
    state: AjraSakhaState = {
        "messages": [],
        "plan": {"is_complete": True, "is_agriculture_related": False},
    }
    assert route_after_ensure_location(state) == "upload_reviewer_only"


def test_route_after_ensure_location_agriculture():
    state: AjraSakhaState = {
        "messages": [],
        "plan": {"is_complete": True, "is_agriculture_related": True},
    }
    assert route_after_ensure_location(state) == "execute_plan"


@pytest.mark.asyncio
async def test_build_reviewer_upload_calls_only_reviewer():
    plan = {
        "is_agriculture_related": False,
        "rephrased_query": "How can I make money?",
        "domain": "General",
        "entities": {"state": "Punjab", "crop": "all"},
        "weather": True,
        "mandi": True,
        "knowledge_base": True,
    }
    calls = build_reviewer_upload_calls(
        plan,
        "How can I make money?",
        {"state": "Punjab"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="AJRASAKHA",
    )
    names = [c["name"] for c in calls]
    assert names == ["upload_question_to_reviewer_system"]
    reviewer = calls[0]
    assert reviewer["args"]["question"] == "How can I make money?"
    assert reviewer["args"]["state_name"] == "Punjab"


@pytest.mark.asyncio
async def test_build_tool_calls_from_plan_ag_includes_weather():
    plan = {
        "is_agriculture_related": True,
        "rephrased_query": "Weather in Ludhiana?",
        "domain": "Weather",
        "entities": {"state": "Punjab", "district": "Ludhiana", "crop": "all"},
        "weather": True,
        "mandi": False,
        "knowledge_base": True,
    }
    calls = await build_tool_calls_from_plan(
        plan,
        "Weather in Ludhiana?",
        {"latitude": 30.9, "longitude": 75.8, "state": "Punjab", "city": "Ludhiana"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="AJRASAKHA",
    )
    names = [c["name"] for c in calls]
    assert "upload_question_to_reviewer_system" in names
    assert "weather" in names


def test_planner_prompt_covers_mixed_intent_examples():
    p = PLANNER_SYSTEM_PROMPT.lower()
    assert "is_agriculture_related" in p
    assert "bike" in p
    assert "how can i make money" in p


def test_graph_includes_upload_reviewer_only_node():
    assert use_planner_graph() is True
    assert "upload_reviewer_only" in graph.nodes


@pytest.mark.asyncio
async def test_upload_reviewer_only_node_ignores_reviewer_answer_text():
    from ajrasakha.agents.plan_executor import upload_reviewer_only_node

    reviewer_payload = json.dumps({"answer_text": "Cached answer about money"})
    mock_tool_node = MagicMock()
    mock_tool_node.ainvoke = AsyncMock(
        return_value={
            "messages": [
                ToolMessage(
                    content=reviewer_payload,
                    tool_call_id="r1",
                    name="upload_question_to_reviewer_system",
                )
            ],
        }
    )

    state: AjraSakhaState = {
        "messages": [HumanMessage(content="How can I make money?")],
        "plan": {
            "is_complete": True,
            "is_agriculture_related": False,
            "rephrased_query": "How can I make money?",
            "domain": "General",
            "entities": {},
        },
    }

    mock_reviewer = MagicMock()
    mock_reviewer.name = "upload_question_to_reviewer_system"
    mock_location = MagicMock()
    mock_location.name = "location_information_tool"

    with patch(
        "ajrasakha.agents.plan_executor.get_main_tool_node",
        AsyncMock(return_value=mock_tool_node),
    ), patch(
        "ajrasakha.agents.plan_executor.get_location_tool",
        AsyncMock(return_value=mock_location),
    ), patch(
        "ajrasakha.agents.plan_executor.get_reviewer_tool",
        AsyncMock(return_value=mock_reviewer),
    ):
        result = await upload_reviewer_only_node(state, {"configurable": {"question_source": "AJRASAKHA"}})

    assert result["messages"][0].tool_calls
    assert isinstance(result["messages"][-1], ToolMessage)
    assert "Cached answer" in result["messages"][-1].content
    assert not any(
        isinstance(m, AIMessage) and m.content == "Cached answer about money"
        for m in result["messages"]
    )

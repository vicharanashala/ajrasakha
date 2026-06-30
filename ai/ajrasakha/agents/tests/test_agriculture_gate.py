"""Tests for is_agriculture_related gate and upload_reviewer_only routing."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from ajrasakha.agents.ajrasakha import graph, use_planner_graph
from ajrasakha.agents.plan_executor import build_reviewer_upload_calls, build_tool_calls_from_plan
from ajrasakha.agents.planner import route_after_ensure_location
from ajrasakha.agents.planner_rules import (
    apply_non_agriculture_gate,
    should_inherit_crop,
    merge_entities_from_rephrased_query,
)
from ajrasakha.agents.prompts import PLANNER_SYSTEM_PROMPT
from ajrasakha.agents.state import AjraSakhaState, PlannerEntities, PlannerPlan


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
    assert "non_agriculture_reply" in graph.nodes
    assert "weather_unavailable_reply" in graph.nodes


def test_non_agriculture_graph_path_is_terminal_and_isolated():
    graph_edges = graph.get_graph().edges
    outgoing = {edge.target for edge in graph_edges if edge.source == "upload_reviewer_only"}
    non_ag_outgoing = {
        edge.target for edge in graph_edges if edge.source == "non_agriculture_reply"
    }

    assert outgoing == {"non_agriculture_reply"}
    assert non_ag_outgoing == {"__end__"}
    assert not outgoing.intersection({"execute_plan", "empty_gdb_reply", "translate_answer"})


def test_agriculture_empty_gdb_and_translation_edges_are_unchanged():
    edges = {(edge.source, edge.target) for edge in graph.get_graph().edges}

    assert ("execute_plan", "empty_gdb_reply") in edges
    assert ("empty_gdb_reply", "translate_answer") in edges
    assert ("translate_answer", "__end__") in edges


def test_weather_unavailable_graph_path_is_terminal():
    edges = {(edge.source, edge.target) for edge in graph.get_graph().edges}
    outgoing = {
        edge.target
        for edge in graph.get_graph().edges
        if edge.source == "weather_unavailable_reply"
    }

    assert ("execute_plan", "weather_unavailable_reply") in edges
    assert outgoing == {"__end__"}


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


# --- Tests for crop inheritance logic ---

class TestShouldInheritCrop:
    """Tests for should_inherit_crop() helper function."""

    def test_should_inherit_crop_current_mentioned(self):
        """Should NOT inherit when current query mentions a crop."""
        result = should_inherit_crop("wheat", current_crop_mentioned=True, domains=["Varieties"])
        assert result is False

    def test_should_inherit_crop_domain_requires_crop_prev_is_all(self):
        """Should NOT inherit when domain requires crop but previous was 'all'."""
        result = should_inherit_crop("all", current_crop_mentioned=False, domains=["Varieties"])
        assert result is False

    def test_should_inherit_crop_domain_requires_crop_prev_is_general(self):
        """Should NOT inherit when domain requires crop but previous was 'general'."""
        result = should_inherit_crop("general", current_crop_mentioned=False, domains=["Seeds"])
        assert result is False

    def test_should_inherit_crop_domain_requires_crop_prev_specific(self):
        """Should inherit when domain requires crop and previous had specific crop."""
        result = should_inherit_crop("wheat", current_crop_mentioned=False, domains=["Varieties"])
        assert result is True

    def test_should_inherit_crop_domain_no_requirement_prev_all(self):
        """Should inherit when domain doesn't require specific crop (even if prev was 'all')."""
        result = should_inherit_crop("all", current_crop_mentioned=False, domains=["Weather"])
        assert result is True

    def test_should_inherit_crop_domain_no_requirement_prev_specific(self):
        """Should inherit when domain doesn't require specific crop and prev had specific crop."""
        result = should_inherit_crop("wheat", current_crop_mentioned=False, domains=["Livestock & Animal Husbandry"])
        assert result is True

    def test_should_inherit_crop_mixed_domains_requires_crop(self):
        """Should NOT inherit if any domain requires crop and prev was 'all'."""
        result = should_inherit_crop("all", current_crop_mentioned=False, domains=["Weather", "Varieties"])
        assert result is False

    def test_should_inherit_crop_mixed_domains_no_requirement(self):
        """Should inherit if no domain requires crop."""
        result = should_inherit_crop("all", current_crop_mentioned=False, domains=["Weather", "Government Schemes"])
        assert result is True


class TestMergeEntitiesCropInheritance:
    """Tests for crop inheritance in merge_entities_from_rephrased_query()."""

    def test_crop_all_not_inherited_for_crop_required_domain(self):
        """Crop 'all' from previous turn should NOT be inherited for crop-required domain.
        
        Scenario: First query about livestock (crop='all'), second query about varieties (no crop mentioned).
        The crop='all' should be cleared so user is asked for crop.
        """
        prev_entities: PlannerEntities = {"crop": "all", "state": "Punjab"}
        plan: PlannerPlan = {
            "domain": "Varieties",
            "domains": ["Varieties"],
            "entities": {},
            "rephrased_query": "Which variety gives the highest yield?",
        }
        messages = [HumanMessage(content="Which variety gives the highest yield?")]

        result = merge_entities_from_rephrased_query(
            plan=plan,
            messages=messages,
            location=None,
            prev_entities=prev_entities,
        )

        # Crop should be cleared since domain requires specific crop and prev was 'all'
        assert result.get("crop") is None or result.get("crop") != "all"

    def test_specific_crop_inherited_for_crop_required_domain(self):
        """Specific crop from previous turn should be inherited for crop-required domain."""
        prev_entities: PlannerEntities = {"crop": "Wheat", "state": "Punjab"}
        plan: PlannerPlan = {
            "domain": "Varieties",
            "domains": ["Varieties"],
            "entities": {},
            "rephrased_query": "Which wheat variety gives the highest yield?",
        }
        messages = [HumanMessage(content="Which wheat variety gives the highest yield?")]

        result = merge_entities_from_rephrased_query(
            plan=plan,
            messages=messages,
            location=None,
            prev_entities=prev_entities,
        )

        # Crop should be inherited
        assert result.get("crop") == "Wheat"

    def test_crop_all_inherited_for_non_crop_required_domain(self):
        """Crop 'all' from previous turn should be inherited for non-crop-required domain."""
        prev_entities: PlannerEntities = {"crop": "all", "state": "Punjab"}
        plan: PlannerPlan = {
            "domain": "Weather",
            "domains": ["Weather"],
            "entities": {},
            "rephrased_query": "What is the weather forecast?",
        }
        messages = [HumanMessage(content="What is the weather forecast?")]

        result = merge_entities_from_rephrased_query(
            plan=plan,
            messages=messages,
            location=None,
            prev_entities=prev_entities,
        )

        # Crop 'all' should be inherited for non-crop-required domain
        assert result.get("crop") == "all"

    def test_current_query_crop_takes_precedence(self):
        """Crop mentioned in current query should take precedence over previous."""
        prev_entities: PlannerEntities = {"crop": "Wheat", "state": "Punjab"}
        plan: PlannerPlan = {
            "domain": "Varieties",
            "domains": ["Varieties"],
            "entities": {},
            "rephrased_query": "Which rice variety gives the highest yield?",
        }
        messages = [HumanMessage(content="Which rice variety gives the highest yield?")]

        result = merge_entities_from_rephrased_query(
            plan=plan,
            messages=messages,
            location=None,
            prev_entities=prev_entities,
        )

        # Current query mentions rice, so crop should be Paddy (rice is mapped to paddy in crop patterns)
        assert result.get("crop") == "Paddy"

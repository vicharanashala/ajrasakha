"""Unit tests for planner routing and plan execution (no live LLM)."""

import pytest

from ajrasakha.agents.plan_executor import (
    build_tool_calls_from_plan,
    extract_chemicals_from_text,
    reviewer_direct_answer,
)
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from ajrasakha.agents.ajrasakha import graph, use_planner_graph
from ajrasakha.agents.synthesizer import _format_tool_results_for_synthesizer
from ajrasakha.agents.plan_executor import execute_plan_node
from ajrasakha.agents.planner import (
    clarify_node,
    is_greeting_message,
    planner_output_to_plan,
    route_after_planner,
    PlannerOutput,
    PlannerEntitiesOutput,
)
from ajrasakha.agents.state import AjraSakhaState
from langchain_core.runnables import RunnableConfig


@pytest.mark.asyncio
async def test_build_tool_calls_includes_reviewer_and_weather():
    plan = {
        "weather": True,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": True,
        "is_complete": True,
        "entities": {"crop": "wheat", "state": "Punjab", "district": "Ropar"},
    }
    calls = await build_tool_calls_from_plan(
        plan,
        "Weather in Ropar and yellow rust on wheat",
        {"latitude": 30.9, "longitude": 76.5, "state": "Punjab", "city": "Ropar"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
    )
    names = [c["name"] for c in calls]
    assert "upload_question_to_reviewer_system" in names
    assert "weather" in names
    assert "gdb" in names


@pytest.mark.asyncio
async def test_build_tool_calls_location_when_gps_unresolved():
    plan = {
        "weather": True,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": False,
        "is_complete": True,
        "entities": {},
    }
    calls = await build_tool_calls_from_plan(
        plan,
        "What is the weather?",
        {"latitude": 18.5, "longitude": 73.8},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
    )
    names = [c["name"] for c in calls]
    assert names[0] == "location_information_tool"


@pytest.mark.asyncio
async def test_reviewer_upload_uses_rephrased_query_not_raw_user_text():
    rephrased = "How to control yellow rust on wheat in Punjab?"
    plan = {
        "weather": False,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": True,
        "is_complete": True,
        "rephrased_query": rephrased,
        "entities": {"crop": "wheat", "state": "Punjab", "district": "Ropar"},
    }
    raw_user = "ਪੰਜਾਬ ਵਿੱਚ ਕਣਕ ਤੇ ਪੀਲਾ ਜੰਗ ਨਿਵਾਰਣ?"
    calls = await build_tool_calls_from_plan(
        plan,
        raw_user,
        {"state": "Punjab", "city": "Ropar"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
    )
    reviewer = next(c for c in calls if c["name"] == "upload_question_to_reviewer_system")
    assert reviewer["args"]["question"] == rephrased
    assert reviewer["args"]["question"] != raw_user


@pytest.mark.asyncio
async def test_reviewer_upload_falls_back_to_user_query_without_rephrased():
    user_text = "Weather in Ropar and yellow rust on wheat"
    plan = {
        "weather": True,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": False,
        "is_complete": True,
        "entities": {"crop": "wheat", "state": "Punjab", "district": "Ropar"},
    }
    calls = await build_tool_calls_from_plan(
        plan,
        user_text,
        {"state": "Punjab", "city": "Ropar"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
    )
    reviewer = next(c for c in calls if c["name"] == "upload_question_to_reviewer_system")
    assert reviewer["args"]["question"] == user_text


def test_planner_output_to_plan():
    out = PlannerOutput(
        weather=True,
        mandi=False,
        knowledge_base=True,
        is_complete=False,
        missing_info=["location"],
        follow_up_question="Which state are you in?",
        entities=PlannerEntitiesOutput(crop="tomato"),
    )
    plan = planner_output_to_plan(out)
    assert plan["weather"] is True
    assert plan["is_complete"] is False
    assert plan["entities"]["crop"] == "tomato"


def test_route_after_planner_incomplete():
    state: AjraSakhaState = {
        "messages": [],
        "location": None,
        "plan": {"is_complete": False, "follow_up_question": "Which crop?"},
    }
    assert route_after_planner(state) == "clarify"


def test_route_after_planner_complete():
    state: AjraSakhaState = {
        "messages": [],
        "location": None,
        "plan": {"is_complete": True},
    }
    assert route_after_planner(state) == "ensure_location"


def test_is_greeting_message():
    assert is_greeting_message("Namaste") is True
    assert is_greeting_message("What is the weather in Punjab?") is False


def test_extract_chemicals_from_text():
    found = extract_chemicals_from_text("Can I use Monocrotophos on cotton?")
    assert any("monocrotophos" in c.lower() for c in found)


def test_reviewer_direct_answer():
    from langchain_core.messages import ToolMessage
    import json

    payload = json.dumps({"answer_text": "Expert answer about wheat rust control steps."})
    msg = ToolMessage(content=payload, tool_call_id="x", name="upload_question_to_reviewer_system")
    assert reviewer_direct_answer([msg]) is not None


def test_clarify_node_emits_follow_up():
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="Leaves turning yellow")],
        "location": None,
        "plan": {
            "is_complete": False,
            "follow_up_question": "Which crop is it, and which part of the leaves are yellow?",
        },
    }
    out = clarify_node(state)
    assert "Which crop" in out["messages"][0].content


@pytest.mark.asyncio
async def test_execute_plan_skips_when_incomplete():
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="What is today's onion price?")],
        "location": None,
        "plan": {"is_complete": False},
    }
    out = await execute_plan_node(state, RunnableConfig())
    assert out == {}


@pytest.mark.asyncio
async def test_csv_onion_price_plan_builds_mandi_only():
    """Manager CSV: onion price without location → mandi flag, planner should gate before execute."""
    plan = {
        "weather": False,
        "mandi": True,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": False,
        "is_complete": True,
        "entities": {"crop": "onion", "state": "Punjab", "district": "Ludhiana"},
    }
    calls = await build_tool_calls_from_plan(
        plan,
        "What is today's onion price?",
        {"state": "Punjab", "city": "Ludhiana"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
    )
    names = [c["name"] for c in calls]
    assert "market" in names
    assert "gdb" not in names


def test_format_tool_results_collects_after_tool_call_ai_message():
    """Regression: reverse scan used to skip ToolMessages before finding the AIMessage."""
    weather_text = "## Weather Summary\nTemperature: 39.3°C\nRainfall: NIL"
    messages = [
        HumanMessage(content="What is the weather in Ropar?"),
        AIMessage(
            content="",
            tool_calls=[{"name": "weather", "args": {}, "id": "1", "type": "tool_call"}],
        ),
        ToolMessage(content=weather_text, tool_call_id="1", name="weather"),
    ]
    block = _format_tool_results_for_synthesizer(messages)
    assert "39.3" in block
    assert "weather" in block.lower()
    assert block != "(No tool results)"


def test_compiled_graph_uses_planner_pipeline_by_default():
    assert use_planner_graph() is True
    assert "planner" in graph.nodes
    assert "execute_plan" in graph.nodes
    assert "synthesize" in graph.nodes

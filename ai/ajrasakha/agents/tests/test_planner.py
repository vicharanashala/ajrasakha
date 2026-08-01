"""Unit tests for planner routing and plan execution (no live LLM)."""

import json

import pytest

from ajrasakha.agents.plan_executor import (
    build_reviewer_upload_calls,
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
        question_source="AJRASAKHA",
    )
    names = [c["name"] for c in calls]
    assert "upload_question_to_reviewer_system" in names
    reviewer = next(c for c in calls if c["name"] == "upload_question_to_reviewer_system")
    assert reviewer["args"]["source"] == "AJRASAKHA"
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
        question_source="AJRASAKHA",
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
    calls = build_reviewer_upload_calls(
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
    calls = build_reviewer_upload_calls(
        plan,
        user_text,
        {"state": "Punjab", "city": "Ropar"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
    )
    reviewer = next(c for c in calls if c["name"] == "upload_question_to_reviewer_system")
    assert reviewer["args"]["question"] == user_text


@pytest.mark.asyncio
async def test_reviewer_upload_includes_identity_fields_for_ajrasakha():
    plan = {
        "weather": False,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": True,
        "is_complete": True,
        "entities": {"crop": "wheat", "state": "Punjab", "district": "Ropar"},
    }
    calls = build_reviewer_upload_calls(
        plan,
        "Yellow rust on wheat",
        {"state": "Punjab", "city": "Ropar"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="AJRASAKHA",
        thread_id="conv-abc-123",
        user_id="user-456",
        message_id="msg-789",
    )
    reviewer = next(c for c in calls if c["name"] == "upload_question_to_reviewer_system")
    assert reviewer["args"]["thread_id"] == "conv-abc-123"
    assert reviewer["args"]["user_id"] == "user-456"
    assert reviewer["args"]["message_id"] == "msg-789"


@pytest.mark.asyncio
async def test_reviewer_upload_omits_identity_fields_for_non_ajrasakha():
    plan = {
        "weather": False,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": True,
        "is_complete": True,
        "entities": {"crop": "wheat", "state": "Punjab", "district": "Ropar"},
    }
    calls = build_reviewer_upload_calls(
        plan,
        "Yellow rust on wheat",
        {"state": "Punjab", "city": "Ropar"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="WHATSAPP",
        thread_id="conv-abc-123",
        user_id="user-456",
        message_id="msg-789",
    )
    reviewer = next(c for c in calls if c["name"] == "upload_question_to_reviewer_system")
    assert reviewer["args"]["thread_id"] == "conv-abc-123"
    assert "user_id" not in reviewer["args"]
    assert "message_id" not in reviewer["args"]


@pytest.mark.asyncio
async def test_reviewer_upload_omits_thread_id_when_not_provided():
    plan = {
        "weather": False,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": True,
        "is_complete": True,
        "entities": {"crop": "wheat", "state": "Punjab", "district": "Ropar"},
    }
    calls = build_reviewer_upload_calls(
        plan,
        "Yellow rust on wheat",
        {"state": "Punjab", "city": "Ropar"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="AJRASAKHA",
    )
    reviewer = next(c for c in calls if c["name"] == "upload_question_to_reviewer_system")
    assert "thread_id" not in reviewer["args"]


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


@pytest.mark.asyncio
async def test_greeting_reviewer_ignores_thread_gps_state():
    """Greeting upload must not use GPS/reverse-geocoded state on thread location."""
    plan = {
        "domain": "General",
        "weather": False,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": False,
        "is_greeting": True,
        "is_complete": True,
        "reasoning": "greeting",
        "entities": {"crop": "all"},
        "rephrased_query": "Hi",
    }
    calls = await build_tool_calls_from_plan(
        plan,
        "Hi",
        {
            "latitude": 32.7,
            "longitude": 74.8,
            "state": "Jammu and Kashmir",
            "city": "Kathua",
        },
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="AJRASAKHA",
    )
    reviewer = next(c for c in calls if c["name"] == "upload_question_to_reviewer_system")
    assert reviewer["args"]["state_name"] == "Not specified"
    assert reviewer["args"]["details"]["state"] == "Not specified"
    assert reviewer["args"]["details"]["district"] == "all"
    assert reviewer["args"]["crop"] == "all"


def test_merge_plan_replaces_stale_entities_on_new_planner_turn():
    from ajrasakha.agents.state import merge_plan

    old = {
        "reasoning": "old_turn",
        "entities": {"state": "Jammu and Kashmir", "crop": "wheat"},
        "is_complete": True,
    }
    new = {
        "reasoning": "greeting",
        "entities": {"crop": "all"},
        "is_greeting": True,
        "is_complete": True,
    }
    merged = merge_plan(old, new)
    assert merged["entities"] == {"crop": "all"}
    assert merged["entities"].get("state") is None


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
        question_source="WHATSAPP",
    )
    names = [c["name"] for c in calls]
    assert "daily_price" in names
    assert "gdb" not in names
    daily = next(c for c in calls if c["name"] == "daily_price")
    assert daily["args"]["crop"] == "onion"
    assert "latitude" in daily["args"]
    assert "longitude" in daily["args"]
    reviewer = next(c for c in calls if c["name"] == "upload_question_to_reviewer_system")
    assert reviewer["args"]["source"] == "WHATSAPP"


@pytest.mark.asyncio
async def test_daily_price_uses_rephrased_query_not_location_followup():
    """After a location follow-up, mandi must get the full price question, not the district reply."""
    rephrased = (
        "What was yesterday's price of wheat compared to today's price "
        "in Khammam district, Telangana?"
    )
    plan = {
        "weather": False,
        "mandi": True,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": True,
        "is_complete": True,
        "rephrased_query": rephrased,
        "original_query_en": (
            "What was yesterday's price of wheat compared to today's price? "
            "Telangana state Khammam district."
        ),
        "entities": {"crop": "Wheat", "state": "Telangana", "district": "Khammam"},
    }
    calls = await build_tool_calls_from_plan(
        plan,
        "Telangana state khammam district.",
        {
            "state": "Telangana",
            "city": "Khammam",
            "latitude": 17.1729189,
            "longitude": 80.4057537,
        },
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="AJRASAKHA",
    )
    daily = next(c for c in calls if c["name"] == "daily_price")
    gdb = next(c for c in calls if c["name"] == "gdb")
    assert daily["args"]["query"] == rephrased
    assert gdb["args"]["rephrased_query"] == rephrased
    assert daily["args"]["crop"] == "Wheat"
    assert daily["args"]["state"] == "Telangana"


@pytest.mark.asyncio
async def test_daily_price_uses_rephrased_query_not_crop_followup():
    rephrased = "nearby market for rice in Guwahati"
    plan = {
        "weather": False,
        "mandi": True,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": False,
        "is_complete": True,
        "rephrased_query": rephrased,
        "entities": {"crop": "Paddy", "state": "Assam", "district": "Guwahati"},
    }
    calls = await build_tool_calls_from_plan(
        plan,
        "rice",
        {"state": "Assam", "city": "Guwahati", "latitude": 26.15, "longitude": 91.69},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="AJRASAKHA",
    )
    daily = next(c for c in calls if c["name"] == "daily_price")
    assert daily["args"]["query"] == rephrased
    assert daily["args"]["crop"] == "Paddy"


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


def test_format_tool_results_omits_gdb_author_and_source():
    """GDB JSON is not passed to tool-only synthesis; sources live in translate_answer."""
    gdb_payload = {
        "is_exact": True,
        "exact_match": {
            "question": "Q",
            "answer": "Expert answer text",
            "details": {
                "author_name": "Dr. Agri",
                "source_name": "SKUAST",
                "source_link": "https://example.com/doc",
            },
        },
    }
    messages = [
        HumanMessage(content="crop question"),
        ToolMessage(
            content=json.dumps(gdb_payload),
            tool_call_id="gdb-1",
            name="gdb",
        ),
        ToolMessage(content="Rain: 5mm", tool_call_id="w-1", name="weather"),
    ]
    block = _format_tool_results_for_synthesizer(messages)
    assert "Dr. Agri" not in block
    assert "SKUAST" not in block
    assert "Expert answer text" not in block
    assert "gdb" not in block.lower()
    assert "Rain: 5mm" in block


def test_compiled_graph_uses_planner_pipeline_by_default():
    assert use_planner_graph() is True
    assert "planner" in graph.nodes
    assert "upload_reviewer_only" in graph.nodes
    assert "execute_plan" in graph.nodes
    assert "assemble_answer_body" in graph.nodes
    assert "synthesize" not in graph.nodes
    assert "translate_answer" in graph.nodes

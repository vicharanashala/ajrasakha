"""Regression: state/district must not leak from unrelated old thread messages."""

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from ajrasakha.agents.location_context import (
    latest_human_text,
    resolve_state_for_turn,
)
from ajrasakha.agents.plan_executor import build_tool_calls_from_plan
from ajrasakha.agents.planner import _resolve_state_deterministic
from ajrasakha.agents.planner_rules import apply_planner_completeness_rules

from ajrasakha.agents.state import AjraSakhaState
def test_state_not_leaked_from_old_karnataka_message():
    messages = [
        HumanMessage(content="Wheat disease control in Karnataka"),
        AIMessage(content="Here is advice for Karnataka wheat."),
        HumanMessage(content="What is PM-KISAN eligibility?"),
    ]
    assert _resolve_state_deterministic(messages, None) is None
    plan = apply_planner_completeness_rules(
        {"schemes": True, "is_complete": True, "entities": {}},
        messages,
        None,
    )
    assert plan["entities"].get("state") != "Karnataka"
    assert plan["is_complete"] is False
    assert "location" in (plan.get("missing_info") or [])


def test_current_message_kerala_overrides_old_karnataka():
    messages = [
        HumanMessage(content="Wheat in Karnataka"),
        AIMessage(content="Answer."),
        HumanMessage(content="How can I grow paddy in kottayam kerla?"),
    ]
    assert _resolve_state_deterministic(messages, None) == "Kerala"
    assert resolve_state_for_turn(latest_human_text(messages), None) == "Kerala"


def test_gps_not_used_when_latest_message_has_no_state():
    messages = [HumanMessage(content="What is PM-KISAN eligibility?")]
    location = {
        "latitude": 30.9,
        "longitude": 76.5,
        "state": "Punjab",
        "city": "Ludhiana",
    }
    assert _resolve_state_deterministic(messages, location) is None
    plan = apply_planner_completeness_rules(
        {"schemes": True, "is_complete": False, "entities": {}},
        messages,
        location,
    )
    assert plan["entities"].get("state") is None
    assert plan["is_complete"] is False
    assert "location" in (plan.get("missing_info") or [])


def test_stale_city_not_used_as_district_without_gps():
    messages = [HumanMessage(content="What is today's onion price?")]
    location = {"state": "Jammu and Kashmir", "city": "Kathua"}
    plan = apply_planner_completeness_rules(
        {
            "mandi": True,
            "is_complete": True,
            "entities": {"crop": "onion", "state": "Punjab"},
        },
        messages,
        location,
    )
    assert plan["entities"].get("district") != "Kathua"


@pytest.mark.asyncio
async def test_gdb_uses_kerala_from_rephrased_plan_not_stale_gps_punjab():
    plan = {
        "weather": False,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": True,
        "is_complete": True,
        "rephrased_query": "How can I grow paddy in Kottayam, Kerala?",
        "entities": {"crop": "paddy", "state": "Kerala"},
    }
    calls = await build_tool_calls_from_plan(
        plan,
        "ਕੋਟਟਾਯਮ ਵਿੱਚ ਧਾਨ ਉਗਾਉਣਾ?",
        {"latitude": 30.9, "longitude": 76.5, "state": "Punjab", "city": "Ludhiana"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="AJRASAKHA",
    )
    gdb = next(c for c in calls if c["name"] == "gdb")
    assert gdb["args"]["state"] == "Kerala"


@pytest.mark.asyncio
async def test_state_does_not_leak_on_new_question_with_gps():
    from ajrasakha.agents.planner import planner_node
    from langchain_core.runnables import RunnableConfig

    # Previous turn complete; new question has no state — GPS must not fill it in.
    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="Wheat disease control in Karnataka"),
            AIMessage(content="Here is advice for Karnataka wheat."),
            HumanMessage(content="how to grow paddy?"),
        ],
        "location": {
            "latitude": 28.3584,
            "longitude": 77.3268,
            "state": "Haryana",
            "city": "Faridabad",
        },
        "plan": {
            "domain": "Plant Protection",
            "is_complete": True,
            "entities": {"crop": "wheat", "state": "Karnataka"},
        },
    }

    res = await planner_node(state, RunnableConfig())
    new_plan = res["plan"]
    assert new_plan["entities"].get("state") is None
    assert new_plan["entities"].get("district") is None


@pytest.mark.asyncio
async def test_state_carries_forward_during_clarify_loop():
    from ajrasakha.agents.planner import planner_node
    from langchain_core.runnables import RunnableConfig

    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="What is mandi price in Karnataka?"),
            AIMessage(content="Which crop do you want to check?"),
            HumanMessage(content="Onion"),
        ],
        "location": {
            "latitude": 28.3584,
            "longitude": 77.3268,
            "state": "Haryana",
            "city": "Faridabad",
        },
        "plan": {
            "domain": "Market Prices",
            "is_complete": False,
            "entities": {"state": "Karnataka"},
        },
    }

    res = await planner_node(state, RunnableConfig())
    new_plan = res["plan"]
    assert new_plan["entities"].get("state") == "Karnataka"
    assert new_plan["entities"].get("crop") == "Onion"


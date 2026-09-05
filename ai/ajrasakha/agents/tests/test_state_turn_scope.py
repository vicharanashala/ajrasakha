"""Regression: state/district must not leak from unrelated old thread messages."""

from unittest.mock import Mock, patch

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


class _StaticPlannerModel:
    """Small structured-output stand-in for planner-node regression tests."""

    def __init__(self, output):
        self.output = output

    def with_structured_output(self, _schema):
        return self

    async def ainvoke(self, _messages, config=None):
        return self.output


class _UnavailablePlannerModel:
    """Structured-output stand-in that exercises the planner fallback path."""

    def with_structured_output(self, _schema):
        return self

    async def ainvoke(self, _messages, config=None):
        raise TimeoutError("planner unavailable")


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

    with patch(
        "ajrasakha.agents.planner.ChatAnthropic",
        return_value=_UnavailablePlannerModel(),
    ):
        res = await planner_node(state, RunnableConfig())
    new_plan = res["plan"]
    assert new_plan["entities"].get("state") is None
    assert new_plan["entities"].get("district") is None


@pytest.mark.asyncio
async def test_state_carries_forward_during_clarify_loop():
    from ajrasakha.agents.planner import PlannerEntitiesOutput, PlannerOutput, planner_node
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

    model = _StaticPlannerModel(
        PlannerOutput(
            domains=["Market Prices"],
            entities=PlannerEntitiesOutput(crop="Onion"),
            original_query_en="Onion",
            rephrased_query="Onion",
        )
    )
    with (
        patch("ajrasakha.agents.planner.ChatAnthropic", return_value=model),
        patch("ajrasakha.agents.planner._llm_detect_language", return_value="English"),
        patch("ajrasakha.agents.planner.maybe_persist_rephrased_query"),
        patch("ajrasakha.agents.planner.maybe_persist_resolved_location"),
    ):
        res = await planner_node(state, RunnableConfig())
    new_plan = res["plan"]
    assert new_plan["entities"].get("state") == "Karnataka"
    assert new_plan["entities"].get("crop") == "Onion"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("script_language", "vocal_language", "should_preserve"),
    [
        ("Gurmukhi", "Punjabi", True),
        ("English", "Punjabi", True),
        ("Devanagari", "Hindi", True),
        ("Unknown", "Punjabi", False),
    ],
)
async def test_location_clarification_preserves_catalog_language_pair(
    script_language, vocal_language, should_preserve
):
    """Preserve supported pairs; safely re-detect invalid legacy pairs."""
    from ajrasakha.agents.planner import PlannerOutput, planner_node
    from langchain_core.runnables import RunnableConfig

    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="ਗੰਨੇ ਵਿੱਚ ਗੋਭ ਦੀ ਸੁੰਡੀ ਦਾ ਇਲਾਜ ਕੀ ਹੈ?"),
            AIMessage(content="ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਜ਼ਿਲ੍ਹਾ ਦੱਸੋ।"),
            HumanMessage(content="rupnagar"),
        ],
        "location": None,
        "plan": {
            "domain": "Weather",
            "domains": ["Weather"],
            "is_complete": False,
            "missing_info": ["location"],
            "entities": {"crop": "all"},
            "rephrased_query": "How can I control early shoot borer in sugarcane?",
            "original_query_en": "How can I control early shoot borer in sugarcane?",
            "vocal_language": vocal_language,
            "script_language": script_language,
        },
    }
    detected_language = Mock(return_value="English")
    model = _StaticPlannerModel(
        PlannerOutput(
            domains=["Weather"],
            rephrased_query="Rupnagar",
            original_query_en="Rupnagar",
            vocal_language="English",
            script_language="English",
        )
    )

    with (
        patch("ajrasakha.agents.planner.ChatAnthropic", return_value=model),
        patch("ajrasakha.agents.planner._llm_detect_language", detected_language),
    ):
        result = await planner_node(state, RunnableConfig())

    if should_preserve:
        assert result["plan"]["vocal_language"] == vocal_language
        assert result["plan"]["script_language"] == script_language
        detected_language.assert_not_called()
    else:
        assert result["plan"]["vocal_language"] == "English"
        assert result["plan"]["script_language"] == "English"
        detected_language.assert_called_once_with(
            "rupnagar",
            script_context="English",
            llm=model,
        )


@pytest.mark.asyncio
async def test_new_question_still_detects_language():
    """Language detection remains enabled when the message is not a clarification reply."""
    from ajrasakha.agents.config import PLANNER_MODEL
    from ajrasakha.agents.planner import PlannerOutput, planner_node
    from langchain_core.runnables import RunnableConfig

    state: AjraSakhaState = {
        "messages": [HumanMessage(content="Mera fasal kaise bachayein?")],
        "location": None,
        "plan": {},
    }
    detected_language = Mock(return_value="Hindi")
    model = _StaticPlannerModel(
        PlannerOutput(
            domains=["Weather"],
            rephrased_query="How can I protect my crop?",
            original_query_en="How can I protect my crop?",
            vocal_language="English",
            script_language="English",
        )
    )

    with (
        patch("ajrasakha.agents.planner.ChatAnthropic", return_value=model) as chat_anthropic,
        patch("ajrasakha.agents.planner._llm_detect_language", detected_language),
    ):
        result = await planner_node(state, RunnableConfig())

    assert result["plan"]["vocal_language"] == "Hindi"
    assert result["plan"]["script_language"] == "English"
    detected_language.assert_called_once_with(
        "Mera fasal kaise bachayein?",
        script_context="English",
        llm=model,
    )
    chat_anthropic.assert_called_once_with(model=PLANNER_MODEL)


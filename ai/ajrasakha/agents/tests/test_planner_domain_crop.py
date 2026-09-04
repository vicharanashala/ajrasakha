"""Integration tests for planner domain + crop pipeline (no live LLM)."""

from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from ajrasakha.agents.domains import apply_tool_flags_from_domain, normalize_crop_value
from ajrasakha.agents.planner import (
    _apply_domain_and_crop_async,
    planner_output_to_plan,
    PlannerOutput,
)
from ajrasakha.agents.planner_rules import extract_crop_from_text


@pytest.mark.asyncio
async def test_never_crop_domain_forces_all():
    plan = {"domain": "Weather", "entities": {}}
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
    ) as mock_cls:
        out, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="PM-KISAN eligibility")],
            crop_prefilled=None,
            config={},
        )
    mock_cls.assert_not_called()
    assert domain == "Weather"
    assert out["entities"]["crop"] == "all"
    assert crop_required is False


@pytest.mark.asyncio
async def test_always_crop_required_domain_requires_crop():
    plan = planner_output_to_plan(
        PlannerOutput(domains=["Plant Protection"], rephrased_query="Leaves turning yellow")
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="input_crop_required",
    ) as classifier:
        out, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="Leaves turning yellow")],
            crop_prefilled=None,
            config={},
        )
    assert domain == "Plant Protection"
    assert out["entities"].get("crop") is None
    assert crop_required is True
    assert out["knowledge_base"] is True
    classifier.assert_awaited_once()


@pytest.mark.asyncio
async def test_always_crop_required_domain_preserves_requirement_for_non_output_decision():
    plan = planner_output_to_plan(
        PlannerOutput(domains=["Plant Protection"], rephrased_query="Leaves turning yellow")
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="crop_not_required",
    ):
        out, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="Leaves turning yellow")],
            crop_prefilled=None,
            config={},
        )
    assert crop_required is True
    assert out["entities"].get("crop") is None


@pytest.mark.asyncio
async def test_always_domain_crop_output_does_not_require_input_crop():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Cultural Practices"],
            rephrased_query="Which crop should I grow in kharif season?",
            entities={"crop": "Kharif crops"},
        )
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="crop_output_requested",
    ) as classifier:
        out, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="Which crop should I grow in kharif season?")],
            crop_prefilled="Kharif crops",
            config={},
        )

    assert domain == "Cultural Practices"
    classifier.assert_not_awaited()
    assert crop_required is False
    assert out["entities"]["crop"] == "all"
    assert out["crop_requirement_source"] == "deterministic_crop_output_requested"


@pytest.mark.asyncio
async def test_seed_drill_still_requires_named_crop():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Agriculture Mechanization"],
            rephrased_query="Which seed drill should I buy?",
        )
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="input_crop_required",
    ) as classifier:
        out, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="Which seed drill should I buy?")],
            crop_prefilled=None,
            config={},
        )

    assert domain == "Agriculture Mechanization"
    assert crop_required is True
    assert out["entities"].get("crop") is None
    classifier.assert_awaited_once()


def test_legacy_crop_patterns_are_used_without_crop_master_aliases():
    assert extract_crop_from_text("I am growing gehu") is None
    assert extract_crop_from_text("I am growing rice") == "paddy"
    assert extract_crop_from_text("I am growing rice") == "Paddy"


def test_missing_crop_values_use_the_mongodb_all_value():
    assert normalize_crop_value(None) == "all"
    assert normalize_crop_value("not specified") == "all"
    assert normalize_crop_value("none") == "all"
    assert normalize_crop_value("null") == "all"
    assert normalize_crop_value("all") == "all"


@pytest.mark.asyncio
async def test_unlisted_crop_scope_phrase_uses_all_after_clarify():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Varieties"],
            rephrased_query="Which seed varieties are best for my field?",
        )
    )
    messages = [
        HumanMessage(content="Which seed varieties are best for my field?"),
        AIMessage(content="Which crop are you growing?"),
        HumanMessage(content="any broad crop is fine"),
    ]
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="input_crop_required",
    ) as classifier:
        out, _domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            messages,
            crop_prefilled=None,
            config={},
        )

    classifier.assert_not_awaited()
    assert crop_required is False
    assert out["entities"]["crop"] == "all"
    assert out["crop_requirement_source"] == "crop_clarification_default_all"


@pytest.mark.asyncio
async def test_general_crop_clarification_resolves_required_crop_once():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Varieties"],
            rephrased_query="Which seed varieties are best for my field in Delhi?",
        )
    )
    messages = [
        HumanMessage(content="Which seed varieties are best for my field in Delhi?"),
        AIMessage(content="Which crop are you growing?"),
        HumanMessage(content="tell me about any general crop"),
    ]
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="input_crop_required",
    ) as classifier:
        out, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            messages,
            crop_prefilled=None,
            config={},
        )

    assert domain == "Varieties"
    assert crop_required is False
    assert out["entities"]["crop"] == "all"
    assert out["crop_requirement_source"] == "deterministic_all_crop_requested"
    classifier.assert_not_awaited()


@pytest.mark.asyncio
async def test_inherited_all_without_explicit_reply_remains_unresolved_for_required_domain():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Varieties"],
            rephrased_query="Which seed varieties are best for my field?",
            entities={"crop": "all"},
        )
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="input_crop_required",
    ) as classifier:
        out, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="Which seed varieties are best for my field?")],
            crop_prefilled=None,
            config={},
        )

    assert domain == "Varieties"
    assert crop_required is True
    assert out["entities"].get("crop") is None
    classifier.assert_awaited_once()


@pytest.mark.asyncio
async def test_crop_required_any_when_mixed_domains_crop_required():
    plan = planner_output_to_plan(
        PlannerOutput(domains=["Weather", "Plant Protection"], rephrased_query="Leaves turning yellow")
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="input_crop_required",
    ):
        out, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="Leaves turning yellow")],
            crop_prefilled=None,
            config={},
        )
    # First domain wins for the returned `domain`, but crop requirement comes from ANY selected domain.
    assert domain == "Weather"
    assert crop_required is True
    assert out["entities"].get("crop") is None


@pytest.mark.asyncio
async def test_tool_flags_or_union_across_domains():
    plan = planner_output_to_plan(
        PlannerOutput(domains=["Weather", "Soil Health Card"], rephrased_query="Soil report please")
    )
    out, domain, crop_required = await _apply_domain_and_crop_async(
        plan,
        [HumanMessage(content="Soil report please")],
        crop_prefilled=None,
        config={},
    )
    assert domain == "Weather"
    assert crop_required is False
    assert out["entities"]["crop"] == "all"
    assert out["weather"] is True
    assert out["soil"] is True


def test_tool_flags_derived_from_domain():
    flags = apply_tool_flags_from_domain("Weather")
    assert flags == {"weather": True, "mandi": False, "soil": False, "schemes": False, "chemical_checker": False, "knowledge_base": False}


@pytest.mark.asyncio
async def test_non_specific_crop_clarification_resolves_to_all():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Plant Protection"],
            rephrased_query="What is the problem with stubble burning?",
            entities={"state": "Punjab"},
        )
    )
    messages = [
        HumanMessage(content="What is the problem with stubble burning?"),
        AIMessage(content="Which crop are you growing?"),
        HumanMessage(content="It does not matter."),
    ]
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="input_crop_required",
    ):
        out, _domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            messages,
            crop_prefilled=None,
            config={},
        )
    assert crop_required is False
    assert out["entities"]["crop"] == "all"
    assert out["crop_requirement_source"] == "crop_clarification_default_all"


@pytest.mark.asyncio
async def test_conditional_domain_classifier_can_mark_crop_not_required():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Market Prices"],
            rephrased_query="What are the general market policies?",
        )
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="crop_not_required",
    ) as classifier:
        out, _domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="What are the general market policies?")],
            crop_prefilled=None,
            config={},
        )

    classifier.assert_awaited_once()
    assert crop_required is False
    assert out["entities"]["crop"] == "all"
    assert out["crop_requirement_source"] == "conditional_llm_not_required"


@pytest.mark.asyncio
async def test_conditional_classifier_is_skipped_when_crop_is_present():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Market Prices"],
            rephrased_query="What is the wheat market price today?",
            entities={"crop": "wheat"},
        )
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value=False,
    ) as classifier:
        out, _domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="What is the wheat market price today?")],
            crop_prefilled="wheat",
            config={},
        )

    classifier.assert_not_awaited()
    assert crop_required is False
    assert out["entities"]["crop"] == "Wheat"
    assert out["crop_requirement_source"] == "existing_crop"


@pytest.mark.asyncio
async def test_conditional_domain_classifier_can_require_missing_crop():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Market Prices"],
            rephrased_query="What is the market price today?",
        )
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="input_crop_required",
    ) as classifier:
        out, _domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="What is the market price today?")],
            crop_prefilled=None,
            config={},
        )

    assert classifier.await_count == 1
    assert crop_required is True
    assert out["entities"].get("crop") is None
    assert out["crop_requirement_source"] == "conditional_llm_required"


@pytest.mark.asyncio
async def test_conditional_classifier_can_mark_crop_as_requested_output():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Horticulture & Allied Agriculture"],
            rephrased_query="Which plant should I grow in the rainy season?",
            entities={"state": "Punjab"},
        )
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="crop_output_requested",
    ) as classifier:
        out, _domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="Which plant should I grow in the rainy season?")],
            crop_prefilled=None,
            config={},
        )

    classifier.assert_not_awaited()
    assert crop_required is False
    assert out["entities"]["crop"] == "all"
    assert out["crop_requirement_source"] == "deterministic_crop_output_requested"


@pytest.mark.asyncio
async def test_passive_crop_output_question_skips_crop_requirement_classifier():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Cultural Practices"],
            rephrased_query="Which crop can be grown with less water?",
        )
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="input_crop_required",
    ) as classifier:
        out, _domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="Which crop can be grown with less water?")],
            crop_prefilled=None,
            config={},
        )

    classifier.assert_not_awaited()
    assert crop_required is False
    assert out["entities"]["crop"] == "all"
    assert out["crop_requirement_source"] == "deterministic_crop_output_requested"


@pytest.mark.asyncio
async def test_crop_availability_clarification_is_not_asked_twice():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Market Information"],
            rephrased_query=(
                "Which crops are available in Kathua mandi? "
                "Crop: I am asking you which crops are avaible."
            ),
        )
    )
    messages = [
        HumanMessage(content="Could you tell me which crops are avaibles in kathua mandi?"),
        AIMessage(content="Which crop are you growing?"),
        HumanMessage(content="I am asking you which crops are avaible."),
    ]
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="input_crop_required",
    ) as classifier:
        out, _domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            messages,
            crop_prefilled=None,
            config={},
        )

    classifier.assert_not_awaited()
    assert crop_required is False
    assert out["entities"]["crop"] == "all"
    assert out["crop_requirement_source"] == "deterministic_crop_output_requested"


@pytest.mark.asyncio
async def test_seed_drill_question_requires_input_crop():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Agriculture Mechanization"],
            rephrased_query="Which seed drill should I buy?",
            entities={"state": "Punjab"},
        )
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value="input_crop_required",
    ):
        out, _domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="Which seed drill should I buy?")],
            crop_prefilled=None,
            config={},
        )

    assert crop_required is True
    assert out["entities"].get("crop") is None
    assert out["crop_requirement_source"] == "conditional_llm_required"


@pytest.mark.asyncio
async def test_weather_domain_never_requires_crop():
    plan = planner_output_to_plan(
        PlannerOutput(
            domains=["Weather"],
            rephrased_query="rainfall condition for the next 2 hrs in pala, kerala",
            entities={"state": "Kerala", "district": "Pala"},
        )
    )
    out, domain, crop_required = await _apply_domain_and_crop_async(
        plan,
        [HumanMessage(content="rainfall condition for the next 2 hrs in pala, kerala")],
        crop_prefilled=None,
        config={},
    )
    assert domain == "Weather"
    assert crop_required is False
    assert out["entities"]["crop"] == "all"


def test_nowcast_routing_heuristics():
    from ajrasakha.agents.new_weather_agent import route_weather_query_by_heuristics
    tool_name = route_weather_query_by_heuristics("rainfall condition for the next 2 hrs in pala, kerala")
    assert tool_name == "get_weather_nowcast"


def test_strict_weather_tool_routing_rules():
    from ajrasakha.agents.new_weather_agent import route_weather_query_by_heuristics

    # 1. Tomorrow's rainfall condition -> MUST route to get_rainfall_and_monsoon_info (Tool 2)
    assert route_weather_query_by_heuristics("tomorrows rainfall condition in palakkad, kerala") == "get_rainfall_and_monsoon_info"

    # 2. Temperature tomorrow -> MUST route to get_temperature_info (Tool 3)
    assert route_weather_query_by_heuristics("tomorrow temperature in palakkad") == "get_temperature_info"

    # 3. Heavy rain warning -> MUST route to get_weather_alerts (Tool 6)
    assert route_weather_query_by_heuristics("heavy rain warning in palakkad") == "get_weather_alerts"

    # 4. Short-term 2 hours rain -> MUST route to get_weather_nowcast (Tool 5)
    assert route_weather_query_by_heuristics("rain in next 2 hours in pala") == "get_weather_nowcast"
    # Word-form hours ("two" not "2") must still hit nowcast
    assert route_weather_query_by_heuristics("next two hours in Sri Muktsar Sahib district") == "get_weather_nowcast"
    assert route_weather_query_by_heuristics("weather for the next three hours in kerala") == "get_weather_nowcast"

    # 5. Block / 50km nearby stations -> MUST route to get_location_weather (Tool 4)
    assert route_weather_query_by_heuristics("piravom block weather stations within 50km") == "get_location_weather"

    # 6. General weather forecast -> MUST route to get_current_and_forecast_info (Tool 1)
    assert route_weather_query_by_heuristics("5 days weather forecast for palakkad") == "get_current_and_forecast_info"

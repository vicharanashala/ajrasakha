"""Integration tests for planner domain + crop pipeline (no live LLM)."""

from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from ajrasakha.agents.domains import apply_tool_flags_from_domain
from ajrasakha.agents.planner import (
    _apply_domain_and_crop_async,
    planner_output_to_plan,
    PlannerOutput,
)


@pytest.mark.asyncio
async def test_crop_all_domain_forces_all():
    plan = {"domain": "Government Schemes", "entities": {}}
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
    assert domain == "Government Schemes"
    assert out["entities"]["crop"] == "all"
    assert crop_required is False


@pytest.mark.asyncio
async def test_crop_required_general_classifier_sets_all():
    plan = planner_output_to_plan(
        PlannerOutput(domains=["Plant Protection"], rephrased_query="Leaves turning yellow")
    )
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


@pytest.mark.asyncio
async def test_crop_required_specific_classifier_requires_crop():
    plan = planner_output_to_plan(
        PlannerOutput(domains=["Plant Protection"], rephrased_query="Leaves turning yellow")
    )
    out, domain, crop_required = await _apply_domain_and_crop_async(
        plan,
        [HumanMessage(content="Leaves turning yellow")],
        crop_prefilled=None,
        config={},
    )
    assert crop_required is True
    assert out["entities"].get("crop") is None


@pytest.mark.asyncio
async def test_crop_required_any_when_mixed_domains_crop_required():
    plan = planner_output_to_plan(
        PlannerOutput(domains=["Weather", "Plant Protection"], rephrased_query="Leaves turning yellow")
    )
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
async def test_crop_fallback_after_clarify_in_apply_domain_and_crop():
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
    out, _domain, crop_required = await _apply_domain_and_crop_async(
        plan,
        messages,
        crop_prefilled=None,
        config={},
    )
    assert crop_required is False
    assert out["entities"]["crop"] == "all"

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
        PlannerOutput(domain="Plant Protection", rephrased_query="Leaves turning yellow")
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value=False,
    ):
        out, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="Leaves turning yellow")],
            crop_prefilled=None,
            config={},
        )
    assert domain == "Plant Protection"
    assert out["entities"]["crop"] == "all"
    assert crop_required is False
    assert out["knowledge_base"] is True


@pytest.mark.asyncio
async def test_crop_required_specific_classifier_requires_crop():
    plan = planner_output_to_plan(
        PlannerOutput(domain="Plant Protection", rephrased_query="Leaves turning yellow")
    )
    with patch(
        "ajrasakha.agents.planner.is_crop_specific_question",
        new_callable=AsyncMock,
        return_value=True,
    ):
        out, domain, crop_required = await _apply_domain_and_crop_async(
            plan,
            [HumanMessage(content="Leaves turning yellow")],
            crop_prefilled=None,
            config={},
        )
    assert crop_required is True
    assert out["entities"].get("crop") is None


def test_tool_flags_derived_from_domain():
    flags = apply_tool_flags_from_domain("Weather")
    assert flags == {"weather": True, "mandi": False, "soil": False, "schemes": False, "chemical_checker": False, "knowledge_base": False}

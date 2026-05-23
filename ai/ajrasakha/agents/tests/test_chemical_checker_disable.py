"""Tests for ENABLE_CHEMICAL_CHECKER kill switch in plan_executor."""

from __future__ import annotations

import json

import pytest
from langchain_core.messages import HumanMessage, ToolMessage

from ajrasakha.agents.plan_executor import (
    ENABLE_CHEMICAL_CHECKER,
    build_tool_calls_from_plan,
    extract_chemicals_from_text,
)
from ajrasakha.agents.prompts import PLANNER_SYSTEM_PROMPT


@pytest.mark.asyncio
async def test_build_tool_calls_omits_chemical_checker_when_disabled():
    plan = {
        "knowledge_base": True,
        "chemical_checker": True,
        "weather": False,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "is_complete": True,
        "entities": {"chemicals": ["Monocrotophos"], "crop": "Cotton", "state": "Punjab"},
        "rephrased_query": "Is Monocrotophos safe on cotton?",
    }
    calls = await build_tool_calls_from_plan(
        plan,
        "Is Monocrotophos safe on cotton?",
        {"state": "Punjab"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="AJRASAKHA",
    )
    names = [c["name"] for c in calls]
    assert "gdb" in names
    if not ENABLE_CHEMICAL_CHECKER:
        assert "chemical_checker" not in names
    else:
        assert "chemical_checker" in names


def test_planner_prompt_says_chemical_checker_disabled():
    assert "chemical_checker" in PLANNER_SYSTEM_PROMPT.lower()
    assert "always leave false" in PLANNER_SYSTEM_PROMPT.lower()


def test_extract_chemicals_still_works_when_tool_disabled():
    """Regex helper remains; executor simply does not schedule the tool."""
    found = extract_chemicals_from_text("Can I use Monocrotophos on cotton?")
    assert found


def test_gdb_text_with_chemicals_does_not_imply_tool_call_when_disabled():
    """Document Path B guard: extra_chems alone does not run without ENABLE."""
    gdb_json = json.dumps(
        {
            "is_exact": False,
            "is_similar": True,
            "similar_pair1": {
                "question": "Q",
                "answer": "Apply Monocrotophos at label rate.",
            },
        }
    )
    msg = ToolMessage(content=gdb_json, tool_call_id="c1", name="gdb")
    from ajrasakha.agents.plan_executor import extract_chemicals_from_tool_messages

    assert extract_chemicals_from_tool_messages([msg])
    assert ENABLE_CHEMICAL_CHECKER is False

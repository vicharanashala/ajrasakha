"""Tests for location field resolution and query state extraction."""

import pytest

from ajrasakha.agents.location_context import (
    extract_state_from_text,
    resolve_location_field,
)
from ajrasakha.agents.plan_executor import build_tool_calls_from_plan


def test_resolve_location_field_prefers_explicit_over_thread():
    assert resolve_location_field("Kerala", "Punjab") == "Kerala"
    assert resolve_location_field("all", "Punjab") == "Punjab"
    assert resolve_location_field("Not specified", "Punjab") == "Punjab"
    assert resolve_location_field(None, "Punjab") == "Punjab"
    assert resolve_location_field(None, None, default="all") == "all"


def test_extract_state_from_text_common_typos():
    assert extract_state_from_text("How can I grow paddy in kottayam kerla?") == "Kerala"
    assert extract_state_from_text("Weather in Ludhiana Punjab") == "Punjab"


@pytest.mark.asyncio
async def test_build_tool_calls_gdb_uses_query_state_over_gps_state():
    plan = {
        "weather": False,
        "mandi": False,
        "soil": False,
        "schemes": False,
        "chemical_checker": False,
        "knowledge_base": True,
        "is_complete": True,
        "entities": {"crop": "paddy"},
    }
    calls = await build_tool_calls_from_plan(
        plan,
        "How can I grow paddy in kottayam kerla?",
        {"latitude": 30.9, "longitude": 76.5, "state": "Punjab", "city": "Ludhiana"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
        question_source="AJRASAKHA",
    )
    gdb = next(c for c in calls if c["name"] == "gdb")
    assert gdb["args"]["state"] == "Kerala"

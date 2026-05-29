"""Entities (state/crop) must come from rephrased_query, not raw farmer text."""

from __future__ import annotations

import pytest
from langchain_core.messages import HumanMessage

from ajrasakha.agents.plan_executor import build_tool_calls_from_plan
from ajrasakha.agents.planner_rules import merge_entities_from_rephrased_query


def test_merge_entities_state_from_rephrased_not_regional_raw():
    plan = {
        "rephrased_query": "How to grow paddy in Kottayam, Kerala?",
        "original_query_en": "How to grow paddy in Kottayam, Kerala?",
        "entities": {},
    }
    messages = [HumanMessage(content="ਕੋਟਟਾਯਮ ਕੇਰਲ ਵਿੱਚ ਧਾਨ ਕਿਵੇਂ ਉਗਾਉਣਾ?")]
    entities = merge_entities_from_rephrased_query(plan, messages, None)
    assert entities["state"] == "Kerala"


def test_merge_entities_crop_from_rephrased_on_new_query():
    plan = {
        "rephrased_query": "Onion mandi price in Punjab",
        "entities": {"crop": "wheat"},
    }
    messages = [
        HumanMessage(content="Wheat disease in Karnataka"),
        HumanMessage(content="ਪੰਜਾਬ ਵਿੱਚ ਪਿਆਜ਼ ਦੀ ਮੰਡੀ ਕੀਮਤ"),
    ]
    entities = merge_entities_from_rephrased_query(plan, messages, None)
    assert entities["crop"] == "Onion"
    assert entities.get("state") == "Punjab"


@pytest.mark.asyncio
async def test_tool_calls_use_entities_from_rephrased_plan():
    plan = {
        "knowledge_base": True,
        "is_complete": True,
        "rephrased_query": "How can I grow paddy in Kottayam, Kerala?",
        "entities": {"crop": "paddy", "state": "Kerala"},
    }
    calls = await build_tool_calls_from_plan(
        plan,
        "ਕੋਟਟਾਯਮ ਕੇਰਲ ਵਿੱਚ ਧਾਨ — raw text without English state names",
        {"latitude": 30.9, "longitude": 76.5, "state": "Punjab", "city": "Ludhiana"},
        location_tool_name="location_information_tool",
        reviewer_tool_name="upload_question_to_reviewer_system",
    )
    gdb = next(c for c in calls if c["name"] == "gdb")
    reviewer = next(c for c in calls if c["name"] == "upload_question_to_reviewer_system")
    assert gdb["args"]["state"] == "Kerala"
    assert gdb["args"]["crop"] == "paddy"
    assert reviewer["args"]["state_name"] == "Kerala"
    assert "Kerala" in reviewer["args"]["question"]

"""Entities (state/crop) must come from rephrased_query, not raw farmer text."""

from __future__ import annotations

import pytest
from langchain_core.messages import HumanMessage

from ajrasakha.agents.plan_executor import build_tool_calls_from_plan
from ajrasakha.agents.domains import is_crop_placeholder
from ajrasakha.agents.planner_rules import (
    is_explicit_all_crop_request,
    is_crop_output_question,
    merge_entities_from_rephrased_query,
)
from ajrasakha.agents import crop_chemical_resolver as resolver


def test_merge_entities_state_from_rephrased_not_regional_raw():
    plan = {
        "rephrased_query": "How to grow paddy in Kottayam, Kerala?",
        "original_query_en": "How to grow paddy in Kottayam, Kerala?",
        "entities": {},
    }
    messages = [HumanMessage(content="ਕੋਟਟਾਯਮ ਕੇਰਲ ਵਿੱਚ ਧਾਨ ਕਿਵੇਂ ਉਗਾਉਣਾ?")]
    entities = merge_entities_from_rephrased_query(plan, messages, None)
    assert entities["state"] == "Kerala"


def test_merge_entities_carries_canonical_chemical_through_clarify():
    resolver.build_cache_from_docs([
        {
            "_id": "chem2",
            "name": "Dazomet",
            "type": "chemical",
            "aliases": [{"english_representation": "mylone", "native_representation": ""}],
        },
    ])
    prev_entities = {"chemicals": ["Dazomet"]}
    plan = {
        "rephrased_query": "How to use mylonee in Punjab?",
        "entities": {"state": "Punjab", "district": "all", "chemicals": ["mylonee"]},
    }
    messages = [
        HumanMessage(content="how to use mylonee"),
        HumanMessage(content="punjab"),
    ]
    entities = merge_entities_from_rephrased_query(
        plan, messages, None, prev_entities=prev_entities
    )
    assert entities["chemicals"] == ["Dazomet"]
    assert entities["state"] == "Punjab"


def test_merge_entities_ignores_gps_location():
    plan = {
        "rephrased_query": "What is PM-KISAN eligibility?",
        "entities": {},
    }
    messages = [HumanMessage(content="What is PM-KISAN eligibility?")]
    location = {
        "latitude": 30.9,
        "longitude": 76.5,
        "state": "Punjab",
        "city": "Ludhiana",
    }
    entities = merge_entities_from_rephrased_query(plan, messages, location)
    assert entities.get("state") is None
    assert entities.get("district") is None


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


@pytest.mark.parametrize("crop_alias", ["multiple", "multiple crop", "Multiple Crops", "general"])
def test_merge_entities_normalizes_non_specific_crop_alias_to_all(crop_alias):
    plan = {
        "rephrased_query": "General crop cultivation guidance",
        "entities": {"crop": crop_alias},
    }
    messages = [HumanMessage(content="General crop cultivation guidance")]

    entities = merge_entities_from_rephrased_query(plan, messages, None)

    assert entities["crop"] == "all"
    assert is_crop_placeholder(crop_alias)


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("Which crop should I grow in kharif season?", True),
        ("What plant is best for the rainy season?", True),
        ("Which crop can be grown with less water?", True),
        ("Which crop can be cultivated with little water?", True),
        ("What crop needs minimal irrigation?", True),
        ("Could you recommend a crop for the rainy season?", True),
        ("Which crop are you growing?", False),
        ("What crop do you currently grow?", False),
        ("Which seed drill should I buy?", False),
    ],
)
def test_crop_output_question_detection(query, expected):
    assert is_crop_output_question(query) is expected


@pytest.mark.parametrize(
    "reply",
    ["tell me about any general crop", "any crop is fine", "general crops"],
)
def test_explicit_non_specific_crop_reply_detection(reply):
    assert is_explicit_all_crop_request(reply) is True


def test_merge_entities_ignores_llm_inferred_kharif_crop_for_crop_output_question():
    plan = {
        "rephrased_query": "Which crop should I grow in kharif season?",
        "entities": {"crop": "Kharif crops"},
    }
    messages = [HumanMessage(content="Which crop should I grow in kharif season?")]

    entities = merge_entities_from_rephrased_query(plan, messages, None)

    assert entities["crop"] == "all"


def test_merge_entities_uses_all_for_explicit_multiple_crop_request():
    plan = {
        "rephrased_query": "Give general advice for multiple crops",
        "entities": {"crop": "Sorghum"},
    }
    messages = [HumanMessage(content="Give general advice for multiple crops")]

    entities = merge_entities_from_rephrased_query(plan, messages, None)

    assert entities["crop"] == "all"


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

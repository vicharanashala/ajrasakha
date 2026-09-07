"""Tests for deterministic localized mandi-unavailable replies."""

from __future__ import annotations

import json

import pytest
from langchain_core.messages import HumanMessage, ToolMessage

from ajrasakha.agents.answer_footers import (
    FOOTER_SEPARATOR,
    build_mandi_unavailable_content,
)
from ajrasakha.agents.mandi_unavailable_reply import mandi_unavailable_reply_node
from ajrasakha.agents.plan_executor import mandi_unavailable_context, route_after_execute
from ajrasakha.agents.translation_catalog import (
    get_crop_price_unavailable_reply,
    get_mandi_unavailable_reply,
    get_testing_disclaimer,
)


def _state_with_daily_price(payload: dict, *, district: str = "Pathankot") -> dict:
    return {
        "messages": [
            HumanMessage(content="What is the current mandi price for paddy?"),
            ToolMessage(
                content=json.dumps(payload),
                tool_call_id="daily-1",
                name="daily_price",
            ),
        ],
        "plan": {
            "mandi": True,
            "entities": {
                "state": "Punjab",
                "district": district,
                "crop": "Paddy",
            },
            "script_language": "English",
            "vocal_language": "English",
        },
    }


def test_crop_price_catalog_reply_substitutes_resolved_values():
    content = build_mandi_unavailable_content(
        "English",
        "English",
        reason="crop_price_unavailable",
        crop_name="Paddy",
        mandi_name="Pathankot",
    )
    expected_body = (
        get_crop_price_unavailable_reply("English", "English")
        .replace("[Crop Name]", "Paddy")
        .replace("[Mandi Name]", "Pathankot")
    )
    assert content == (
        f"{expected_body}\n\n{FOOTER_SEPARATOR}\n\n"
        f"{get_testing_disclaimer('English', 'English')}"
    )


def test_mandi_catalog_reply_uses_requested_language_pair():
    content = build_mandi_unavailable_content(
        "Devanagari",
        "Hindi",
        reason="mandi_unavailable",
        crop_name="Paddy",
        mandi_name="Pathankot",
    )
    expected_body = get_mandi_unavailable_reply("Devanagari", "Hindi").replace(
        "[Mandi Name]", "Pathankot"
    )
    assert content.startswith(expected_body)
    assert content.endswith(get_testing_disclaimer("Devanagari", "Hindi"))


def test_empty_daily_price_answer_with_missing_crop_records_uses_crop_fallback():
    state = _state_with_daily_price(
        {
            "answer": "",
            "tool_data": {
                "error": "No markets_commodities entries matched crop=['Paddy'] in state=Punjab."
            },
        }
    )
    context = mandi_unavailable_context(state)
    assert context is not None
    assert context.reason == "crop_price_unavailable"
    assert context.crop_name == "Paddy"
    assert context.mandi_name == "Pathankot"
    assert route_after_execute(state) == "mandi_unavailable_reply"


def test_missing_mandi_uses_mandi_catalog_fallback_and_tool_market_name():
    state = _state_with_daily_price(
        {
            "answer": "Mandi price data is not available.",
            "tool_data": {
                "error": "APMC not available for state 'Punjab'.",
                "market_name": "Pathankot APMC",
            },
        }
    )
    context = mandi_unavailable_context(state)
    assert context is not None
    assert context.reason == "mandi_unavailable"
    assert context.mandi_name == "Pathankot APMC"
    assert route_after_execute(state) == "mandi_unavailable_reply"


def test_successful_daily_price_answer_keeps_normal_answer_assembly():
    state = _state_with_daily_price(
        {
            "answer": "Paddy modal price is Rs 3,600 per quintal.",
            "tool_data": {"price_records": [{"market_name": "Genhri APMC"}]},
        }
    )
    assert mandi_unavailable_context(state) is None
    assert route_after_execute(state) == "assemble_answer_body"


@pytest.mark.asyncio
async def test_terminal_node_returns_localized_catalog_content():
    state = _state_with_daily_price(
        {
            "answer": "",
            "tool_data": {"error": "No price records found."},
        }
    )
    result = await mandi_unavailable_reply_node(state)
    text = result["messages"][0].content
    assert "Paddy" in text
    assert "Pathankot" in text
    assert get_testing_disclaimer("English", "English") in text

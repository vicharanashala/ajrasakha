"""Tests for turn-scoped crop resolution."""

from langchain_core.messages import AIMessage, HumanMessage

from ajrasakha.agents.planner_rules import (
    is_crop_clarify_turn,
    resolve_crop_for_turn,
)


def test_crop_clarify_turn_extracts_cotton():
    messages = [
        HumanMessage(content="My leaves are turning yellow"),
        AIMessage(content="Which crop are you growing?"),
        HumanMessage(content="Cotton"),
    ]
    assert is_crop_clarify_turn(messages) is True
    assert resolve_crop_for_turn(messages) == "Cotton"


def test_new_query_does_not_bleed_crop_from_old_turn():
    messages = [
        HumanMessage(content="Yellow rust on my wheat crop"),
        AIMessage(content="Here is advice for wheat."),
        HumanMessage(content="What is PM-KISAN eligibility?"),
    ]
    assert is_crop_clarify_turn(messages) is False
    assert resolve_crop_for_turn(messages) is None


def test_latest_message_crop_on_new_query():
    messages = [
        HumanMessage(content="Wheat disease in Karnataka"),
        HumanMessage(content="Onion mandi price in Punjab"),
    ]
    assert resolve_crop_for_turn(messages) == "Onion"

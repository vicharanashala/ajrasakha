"""Unit tests for the static-vs-dynamic answer-source decision."""

import pytest

from ajrasakha.tools.golden.gemma_classifier import _parse_answer_source_response
from ajrasakha.tools.golden.golden_search import _attach_routing_decision


@pytest.mark.parametrize(
    "content,expected",
    [
        ('{"reason": "standing practice", "answer_source": "GDB"}', "GDB"),
        ('{"reason": "today\'s number", "answer_source": "DYNAMIC"}', "DYNAMIC"),
        ('{"reason": "two questions", "answer_source": "BOTH"}', "BOTH"),
        ('```json\n{"reason": "r", "answer_source": "GDB"}\n```', "GDB"),
        ('{"answer_source": "gdb", "reason": "lowercase"}', "GDB"),
    ],
)
def test_parse_answer_source_valid(content, expected):
    assert _parse_answer_source_response(content)[0] == expected


@pytest.mark.parametrize("content", ["not json at all", "", "{}", '{"answer_source": "MAYBE"}'])
def test_parse_answer_source_defaults_to_both(content):
    """Unparseable verdicts must keep the safe expert-queue behaviour."""
    assert _parse_answer_source_response(content)[0] == "BOTH"


def test_parse_answer_source_recovers_from_prose():
    assert _parse_answer_source_response("I think this is DYNAMIC data")[0] == "DYNAMIC"


@pytest.mark.asyncio
async def test_routing_skipped_without_dynamic_tools():
    """A plain Golden lookup must not pay for an extra Gemma call."""
    response = {"exact_match": {"question": "Q", "answer": "A"}, "routing": None}
    out = await _attach_routing_decision(response, scoring_query="Q", dynamic_tools=[])
    assert out["routing"] is None


@pytest.mark.asyncio
async def test_routing_skipped_without_gdb_match():
    """Nothing to weigh the live data against — leave routing unset."""
    response = {"exact_match": {}, "selected_match": None, "routing": None}
    out = await _attach_routing_decision(
        response, scoring_query="Q", dynamic_tools=["weather"]
    )
    assert out["routing"] is None

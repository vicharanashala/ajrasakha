"""Unit tests for retrieval_sanitizer node and post-execute routing."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from ajrasakha.agents.plan_executor import route_after_execute
from ajrasakha.agents.prompts import RETRIEVAL_SANITIZER_SYSTEM_PROMPT
from ajrasakha.agents.retrieval_sanitizer import (
    RELEVANCE_THRESHOLD,
    _apply_scores,
    _collect_similar_pairs,
    _parse_batch_results,
    gdb_has_usable_answers,
    retrieval_sanitizer_node,
    should_skip_sanitizer_for_gdb,
)
from ajrasakha.agents.state import AjraSakhaState


def _gdb_payload(**overrides) -> dict:
    base = {
        "rephrased_query": "How to grow wheat in Punjab?",
        "state": "Punjab",
        "crop": "wheat",
        "is_exact": False,
        "is_similar": True,
        "similar_pair1": {
            "question": "Wheat cultivation Punjab",
            "answer": "Sow in November...",
            "details": {"source_name": "PAU", "author_name": "Expert A"},
        },
        "similar_pair2": {
            "question": "Rice pests",
            "answer": "Use IPM for rice...",
            "details": {"source_name": "PAU", "author_name": "Expert B"},
        },
    }
    base.update(overrides)
    return base


def _state_with_gdb(gdb_data: dict, user_query: str = "गेहूं कैसे उगाएं?") -> AjraSakhaState:
    gdb_json = json.dumps(gdb_data)
    return {
        "messages": [
            HumanMessage(content=user_query),
            AIMessage(content="", tool_calls=[{"id": "call_gdb", "name": "gdb", "args": {}}]),
            ToolMessage(content=gdb_json, tool_call_id="call_gdb", name="gdb", id="gdb-msg-1"),
        ],
        "plan": {"rephrased_query": "How to grow wheat in Punjab?"},
        "location": {"state": "Punjab"},
    }


# ── Prompt contract ───────────────────────────────────────────────────────


def test_sanitizer_prompt_scores_only_not_routing():
    p = RETRIEVAL_SANITIZER_SYSTEM_PROMPT
    assert "score only" in p.lower()
    assert "python applies" in p.lower() or "python" in p.lower()
    assert "pair_key" in p
    assert "forwarded to the synthesize" not in p.lower()
    assert "must be discarded" not in p.lower()


# ── Routing ───────────────────────────────────────────────────────────────


def test_route_exact_match_skips_sanitizer():
    data = _gdb_payload(is_exact=True, is_similar=False)
    data["exact_match"] = {"question": "Q", "answer": "Expert wheat guide."}
    state = _state_with_gdb(data)
    assert route_after_execute(state) == "assemble_answer_body"


def test_route_similar_only_goes_to_assemble_answer_body():
    state = _state_with_gdb(_gdb_payload())
    assert route_after_execute(state) == "assemble_answer_body"


def test_route_no_gdb_with_weather_goes_to_assemble_answer_body():
    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="Weather in Punjab?"),
            AIMessage(content="", tool_calls=[{"id": "call_w", "name": "weather", "args": {}}]),
            ToolMessage(content="Forecast: rain", tool_call_id="call_w", name="weather"),
        ],
        "plan": {},
    }
    assert route_after_execute(state) == "assemble_answer_body"


def test_route_gdb_and_weather_to_assemble_answer_body():
    data = _gdb_payload(is_exact=True, is_similar=False)
    data["exact_match"] = {"question": "Q", "answer": "Expert wheat guide."}
    state = _state_with_gdb(data)
    state["messages"].extend([
        AIMessage(content="", tool_calls=[{"id": "call_w", "name": "weather", "args": {}}]),
        ToolMessage(content="Forecast: rain", tool_call_id="call_w", name="weather"),
    ])
    assert route_after_execute(state) == "assemble_answer_body"


def test_route_skip_synthesize_goes_to_translate_answer():
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="Hi")],
        "plan": {"skip_synthesize": True},
    }
    assert route_after_execute(state) == "translate_answer"


def test_route_empty_gdb_sentinel():
    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="Wheat?"),
            ToolMessage(content="NO_RELEVANT_CONTENT", tool_call_id="c1", name="gdb"),
        ],
        "plan": {},
    }
    assert route_after_execute(state) == "empty_gdb_reply"


def test_should_skip_sanitizer_for_gdb():
    exact_data = _gdb_payload(
        is_exact=True,
        is_similar=False,
        exact_match={"question": "Q", "answer": "A"},
    )
    assert should_skip_sanitizer_for_gdb(exact_data) is True
    assert should_skip_sanitizer_for_gdb(_gdb_payload()) is False


# ── Parsing / filtering helpers ───────────────────────────────────────────


def test_parse_batch_results_array():
    raw = json.dumps(
        [
            {"pair_key": "similar_pair1", "relevance_score": 0.95, "reason": "direct"},
            {"pair_key": "similar_pair2", "relevance_score": 0.4, "reason": "rice not wheat"},
        ]
    )
    scores, reasons = _parse_batch_results(raw)
    assert scores == {"similar_pair1": 0.95, "similar_pair2": 0.4}
    assert reasons["similar_pair1"] == "direct"


def test_parse_batch_results_with_markdown_fence():
    raw = '```json\n[{"pair_key":"similar_pair1","relevance_score":0.91,"reason":"ok"}]\n```'
    scores, _reasons = _parse_batch_results(raw)
    assert scores == {"similar_pair1": 0.91}


def test_apply_scores_drops_below_threshold():
    data = _gdb_payload()
    pairs = _collect_similar_pairs(data)
    _apply_scores(data, pairs, {"similar_pair1": 0.95, "similar_pair2": 0.5})
    assert "similar_pair1" in data
    assert "similar_pair2" not in data
    assert data["is_similar"] is True


def test_apply_scores_fail_open_missing_pair():
    data = _gdb_payload()
    pairs = _collect_similar_pairs(data)
    _apply_scores(data, pairs, {"similar_pair1": 0.95})
    assert "similar_pair1" in data
    assert "similar_pair2" in data


def test_apply_scores_fail_open_none_scores():
    data = _gdb_payload()
    pairs = _collect_similar_pairs(data)
    _apply_scores(data, pairs, None)
    assert "similar_pair1" in data
    assert "similar_pair2" in data


def test_sanitizer_stable_gdb_tool_message_id_when_missing():
    """New GDB ToolMessage uses gdb-{tool_call_id} for in-place graph updates."""
    data = _gdb_payload()
    msg = ToolMessage(
        content=json.dumps(data),
        tool_call_id="call_xyz",
        name="gdb",
    )
    stable_id = getattr(msg, "id", None) or f"gdb-{msg.tool_call_id}"
    assert stable_id == "gdb-call_xyz"


def test_apply_scores_all_dropped_sets_is_similar_false():
    data = _gdb_payload()
    pairs = _collect_similar_pairs(data)
    _apply_scores(
        data,
        pairs,
        {"similar_pair1": 0.5, "similar_pair2": 0.3},
    )
    assert data.get("similar_pair1") is None or "similar_pair1" not in data
    assert "similar_pair2" not in data
    assert data["is_similar"] is False
    assert gdb_has_usable_answers(data) is False


# ── Node (mocked LLM) ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_node_exact_match_noop():
    data = _gdb_payload(
        is_exact=True,
        is_similar=False,
        exact_match={"question": "Q", "answer": "Full answer"},
    )
    state = _state_with_gdb(data)
    result = await retrieval_sanitizer_node(state, {})
    assert result["sanitizer_audit"]["status"] == "skipped"
    assert result["sanitizer_audit"]["skip_reason"] == "exact_match_bypass"
    assert "messages" not in result


@pytest.mark.asyncio
async def test_node_no_gdb_noop():
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="Hello")],
        "plan": {},
    }
    result = await retrieval_sanitizer_node(state, {})
    assert result["sanitizer_audit"]["status"] == "noop"
    assert result["sanitizer_audit"]["skip_reason"] == "no_gdb_tool_message"


@pytest.mark.asyncio
async def test_node_filters_pairs_via_llm():
    state = _state_with_gdb(_gdb_payload())
    llm_response = MagicMock()
    llm_response.content = json.dumps(
        [
            {"pair_key": "similar_pair1", "relevance_score": 0.95, "reason": "wheat"},
            {"pair_key": "similar_pair2", "relevance_score": 0.2, "reason": "rice"},
        ]
    )

    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=llm_response)

    with patch(
        "ajrasakha.agents.retrieval_sanitizer.ChatAnthropic",
        return_value=mock_llm,
    ):
        result = await retrieval_sanitizer_node(state, {})

    assert "messages" in result
    updated = result["messages"][0]
    assert isinstance(updated, ToolMessage)
    assert updated.id == "gdb-msg-1"
    parsed = json.loads(updated.content)
    assert "similar_pair1" in parsed
    assert "similar_pair2" not in parsed
    assert parsed["is_similar"] is True
    audit = result["sanitizer_audit"]
    assert "plan" not in result  # no longer writes to plan
    assert audit["status"] == "filtered"
    assert audit["pairs_kept"] == 1
    assert audit["pairs_dropped"] == 1
    assert audit["evaluations"][0]["retrieved_question"]
    assert audit["evaluations"][0]["action"] == "kept"
    assert audit["evaluations"][1]["action"] == "dropped"
    mock_llm.ainvoke.assert_awaited_once()


@pytest.mark.asyncio
async def test_node_invalid_json_keeps_all_pairs():
    state = _state_with_gdb(_gdb_payload())
    llm_response = MagicMock()
    llm_response.content = "not valid json at all"

    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=llm_response)

    with patch(
        "ajrasakha.agents.retrieval_sanitizer.ChatAnthropic",
        return_value=mock_llm,
    ):
        result = await retrieval_sanitizer_node(state, {})

    parsed = json.loads(result["messages"][0].content)
    assert "similar_pair1" in parsed
    assert "similar_pair2" in parsed


@pytest.mark.asyncio
async def test_node_llm_failure_keeps_all_pairs():
    state = _state_with_gdb(_gdb_payload())
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(side_effect=RuntimeError("API down"))

    with patch(
        "ajrasakha.agents.retrieval_sanitizer.ChatAnthropic",
        return_value=mock_llm,
    ):
        result = await retrieval_sanitizer_node(state, {})

    parsed = json.loads(result["messages"][0].content)
    assert "similar_pair1" in parsed
    assert "similar_pair2" in parsed


def test_relevance_threshold_is_point_nine():
    assert RELEVANCE_THRESHOLD == 0.9


def test_sanitizer_does_not_write_to_plan():
    """Sanitizer node output must NOT include a 'plan' key — it only writes sanitizer_audit."""
    from ajrasakha.agents.retrieval_sanitizer import _audit_response

    state: AjraSakhaState = {
        "messages": [HumanMessage(content="test")],
        "plan": {"weather": True, "knowledge_base": True},
    }
    audit = {"status": "filtered", "pairs_kept": 1}
    result = _audit_response(state, audit)
    assert "plan" not in result
    assert result["sanitizer_audit"] == audit

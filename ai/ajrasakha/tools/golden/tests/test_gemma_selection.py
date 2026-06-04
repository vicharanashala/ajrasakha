"""Unit tests for Gemma pair selection and parsing helpers."""

import json

import pytest

from ajrasakha.tools.golden.gemma_classifier import (
    _parse_batch_relevance_response,
    _parse_tie_breaker_response,
    _pick_single_candidate,
    select_best_match,
)
from ajrasakha.tools.golden.golden_core import QuestionAnswerPair


def _pair(qid: str, score: float) -> QuestionAnswerPair:
    return QuestionAnswerPair(
        question_id=qid,
        question_text=f"Q {qid}",
        answer_text=f"A {qid}",
        author=None,
        sources=[],
        similarity_score=score,
    )


def test_parse_batch_relevance_defaults_all_keep():
    results = _parse_batch_relevance_response("not json", 3)
    assert len(results) == 3
    assert all(r["relevance_decision"] == "KEEP" for r in results)


def test_parse_batch_relevance_mixed():
    raw = json.dumps({
        "results": [
            {"index": 1, "decision": "KEEP", "reason": "same crop"},
            {"index": 2, "decision": "REJECT", "reason": "unrelated topic"},
            {"index": 3, "decision": "KEEP", "reason": "similar symptom"},
        ]
    })
    results = _parse_batch_relevance_response(raw, 3)
    assert results[0]["relevance_decision"] == "KEEP"
    assert results[1]["relevance_decision"] == "REJECT"
    assert results[2]["relevance_decision"] == "KEEP"


def test_parse_tie_breaker_index():
    idx, _ = _parse_tie_breaker_response('{"best_index": 2, "reason": "more specific"}', 3)
    assert idx == 2


def test_pick_single_candidate():
    bucket = [(0.7, _pair("a", 0.7), {"classification": "SAME_INTENT"})]
    pair, _, method = _pick_single_candidate(bucket)
    assert pair.question_id == "a"
    assert method == "single_candidate"


@pytest.mark.asyncio
async def test_select_same_intent_over_covered():
    pairs = [_pair("a", 0.7), _pair("b", 0.95)]
    classifications = [
        {"classification": "COVERED_BY_CONTEXT", "reason": "ok"},
        {"classification": "SAME_INTENT", "reason": "same"},
    ]
    result = await select_best_match("farmer q", pairs, classifications)
    assert result is not None
    assert result["pair"].question_id == "b"
    assert result["winning_class"] == "SAME_INTENT"


@pytest.mark.asyncio
async def test_select_tie_breaker_when_two_same_intent(monkeypatch):
    """Two SAME_INTENT → LLM tie-breaker (not vector score only)."""

    async def mock_tie_breaker(original_query, candidates, winning_class):
        assert len(candidates) == 2
        assert winning_class == "SAME_INTENT"
        _, pair, cls_result = candidates[1]
        return pair, cls_result, "same_intent_tie_breaker"

    monkeypatch.setattr(
        "ajrasakha.tools.golden.gemma_classifier.tie_breaker",
        mock_tie_breaker,
    )
    pairs = [_pair("a", 0.7), _pair("b", 0.95)]
    classifications = [
        {"classification": "SAME_INTENT", "reason": "a"},
        {"classification": "SAME_INTENT", "reason": "b"},
    ]
    result = await select_best_match("farmer q", pairs, classifications)
    assert result is not None
    assert result["pair"].question_id == "b"
    assert result["selection_method"] == "tie_breaker"
    assert result["winning_class"] == "SAME_INTENT"


@pytest.mark.asyncio
async def test_select_single_candidate_when_one_same_intent(monkeypatch):
    async def fail_tie_breaker(*_args, **_kwargs):
        raise AssertionError("tie_breaker should not run for a single candidate")

    monkeypatch.setattr(
        "ajrasakha.tools.golden.gemma_classifier.tie_breaker",
        fail_tie_breaker,
    )
    pairs = [_pair("a", 0.8)]
    classifications = [{"classification": "SAME_INTENT", "reason": "only one"}]
    result = await select_best_match("farmer q", pairs, classifications)
    assert result is not None
    assert result["pair"].question_id == "a"
    assert result["selection_method"] == "single_candidate"


@pytest.mark.asyncio
async def test_select_tie_breaker_covered_when_no_same_intent(monkeypatch):
    async def mock_tie_breaker(original_query, candidates, winning_class):
        assert winning_class == "COVERED_BY_CONTEXT"
        assert len(candidates) == 2
        return candidates[0][1], candidates[0][2], "covered_by_context_tie_breaker"

    monkeypatch.setattr(
        "ajrasakha.tools.golden.gemma_classifier.tie_breaker",
        mock_tie_breaker,
    )
    pairs = [_pair("a", 0.6), _pair("b", 0.9)]
    classifications = [
        {"classification": "COVERED_BY_CONTEXT", "reason": "x"},
        {"classification": "COVERED_BY_CONTEXT", "reason": "y"},
    ]
    result = await select_best_match("farmer q", pairs, classifications)
    assert result is not None
    assert result["winning_class"] == "COVERED_BY_CONTEXT"
    assert result["selection_method"] == "tie_breaker"


@pytest.mark.asyncio
async def test_select_none_for_partial_or_not_covered():
    pairs = [_pair("a", 0.9), _pair("b", 0.8)]
    classifications = [
        {"classification": "PARTIALLY_COVERED", "reason": "partial"},
        {"classification": "NOT_COVERED", "reason": "no"},
    ]
    assert await select_best_match("q", pairs, classifications) is None

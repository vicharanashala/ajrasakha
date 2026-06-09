"""Unit tests for Gemma pair selection and parsing helpers."""

import json

import pytest

from ajrasakha.tools.golden.gemma_classifier import (
    _enforce_at_most_one_same,
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


def test_parse_batch_relevance_same_decision():
    raw = json.dumps({
        "results": [
            {"index": 1, "decision": "SAME", "reason": "paraphrase match"},
            {"index": 2, "decision": "KEEP", "reason": "related"},
        ]
    })
    results = _parse_batch_relevance_response(raw, 2)
    assert results[0]["relevance_decision"] == "SAME"
    assert results[0]["relevance_reason"] == "paraphrase match"
    assert results[1]["relevance_decision"] == "KEEP"


def test_enforce_at_most_one_same_demotes_lower_score():
    pairs = [_pair("a", 0.6), _pair("b", 0.9)]
    results = [
        {"relevance_decision": "SAME", "relevance_reason": "first same"},
        {"relevance_decision": "SAME", "relevance_reason": "second same"},
    ]
    enforced = _enforce_at_most_one_same(results, pairs)
    assert enforced[0]["relevance_decision"] == "KEEP"
    assert "demoted" in enforced[0]["relevance_reason"]
    assert enforced[1]["relevance_decision"] == "SAME"


def test_enforce_at_most_one_same_unchanged_when_zero_or_one():
    pairs = [_pair("a", 0.8), _pair("b", 0.7)]
    single = [
        {"relevance_decision": "SAME", "relevance_reason": "only one"},
        {"relevance_decision": "KEEP", "relevance_reason": "ok"},
    ]
    assert _enforce_at_most_one_same(single, pairs) == single

    none_same = [
        {"relevance_decision": "KEEP", "relevance_reason": "ok"},
        {"relevance_decision": "REJECT", "relevance_reason": "no"},
    ]
    assert _enforce_at_most_one_same(none_same, pairs) == none_same


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


@pytest.mark.asyncio
async def test_gdb_search_same_question_bypass(monkeypatch):
    from ajrasakha.tools.golden import golden_search

    rag_pairs = [_pair("winner", 0.85), _pair("other", 0.7)]

    async def mock_strict(*_args, **_kwargs):
        return []

    async def mock_rag(*_args, **_kwargs):
        return rag_pairs

    async def mock_filter(*_args, **_kwargs):
        return [
            {
                "relevance_decision": "SAME",
                "relevance_reason": "paraphrase",
                "llm_parse_ok": True,
            },
            {
                "relevance_decision": "KEEP",
                "relevance_reason": "related",
                "llm_parse_ok": True,
            },
        ]

    async def fail_classify(*_args, **_kwargs):
        raise AssertionError("classify_pair should not run on SAME bypass")

    monkeypatch.setattr(golden_search, "strict_exact_search", mock_strict)
    monkeypatch.setattr(golden_search, "vector_rag_search", mock_rag)
    monkeypatch.setattr(golden_search, "filter_relevance_batch", mock_filter)
    monkeypatch.setattr(golden_search, "classify_pair", fail_classify)

    result = await golden_search.gdb_search("farmer question", "wheat", "punjab")

    assert result["selected_match"]["question_id"] == "winner"
    assert result["selected_match"]["answer_from_class"] == "SAME_INTENT"
    audit = result["classification_audit"]
    assert audit["selection_rule"] == "same_question_relevance_bypass"
    assert audit["selection_method"] == "same_question_bypass"
    assert audit["status"] == "selected"
    evals = {e["question_id"]: e for e in audit["evaluations"]}
    assert evals["winner"]["action"] == "selected"
    assert evals["other"]["action"] == "skipped_same_bypass"

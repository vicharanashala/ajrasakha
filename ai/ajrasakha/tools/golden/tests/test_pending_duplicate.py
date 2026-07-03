"""Unit tests for pending duplicate check."""

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from ajrasakha.tools.golden.golden_api import PendingDuplicateCheckRequest
from ajrasakha.tools.golden.golden_core import (
    PendingQuestionCandidate,
    parse_created_before,
)
from ajrasakha.tools.golden.golden_pending_duplicate import (
    check_pending_duplicate,
    duplicate_return_id,
    pick_duplicate_winner,
)
from ajrasakha.tools.golden.gemma_classifier import _parse_pending_duplicate_response


def _cand(
    qid: str,
    *,
    ref: str | None = None,
    created_at: datetime | None = None,
    score: float = 0.8,
) -> PendingQuestionCandidate:
    return PendingQuestionCandidate(
        question_id=qid,
        question_text=f"Question {qid}",
        reference_question_id=ref,
        created_at=created_at,
        similarity_score=score,
    )


def test_pick_duplicate_winner_prefers_reference_question_id():
    older = _cand(
        "aaa",
        created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )
    with_ref = _cand("bbb", ref="ref123")
    winner = pick_duplicate_winner([older, with_ref])
    assert winner is not None
    assert winner.question_id == "bbb"


def test_pick_duplicate_winner_oldest_when_no_reference():
    older = _cand("old", created_at=datetime(2024, 1, 1, tzinfo=timezone.utc))
    newer = _cand("new", created_at=datetime(2025, 1, 1, tzinfo=timezone.utc))
    winner = pick_duplicate_winner([newer, older])
    assert winner is not None
    assert winner.question_id == "old"


def test_pick_duplicate_winner_missing_created_at_last():
    with_ts = _cand("has_ts", created_at=datetime(2024, 6, 1, tzinfo=timezone.utc))
    no_ts = _cand("no_ts", created_at=None)
    winner = pick_duplicate_winner([no_ts, with_ts])
    assert winner is not None
    assert winner.question_id == "has_ts"


def test_duplicate_return_id_uses_reference_when_present():
    cand = _cand("q1", ref="ref99")
    assert duplicate_return_id(cand) == "ref99"


def test_duplicate_return_id_falls_back_to_question_id():
    cand = _cand("q1")
    assert duplicate_return_id(cand) == "q1"


def test_parse_pending_duplicate_response_same_and_not_same():
    raw = (
        '{"results": ['
        '{"index": 1, "decision": "SAME", "reason": "paraphrase"},'
        '{"index": 2, "decision": "NOT_SAME", "reason": "different"}'
        "]}"
    )
    results = _parse_pending_duplicate_response(raw, 2)
    assert results[0]["relevance_decision"] == "SAME"
    assert results[1]["relevance_decision"] == "NOT_SAME"


def test_parse_created_before_iso():
    dt = parse_created_before("2026-05-31T12:10:16.649+00:00")
    assert dt.year == 2026
    assert dt.month == 5
    assert dt.day == 31


def test_parse_created_before_z_suffix():
    dt = parse_created_before("2026-05-31T12:10:16.649Z")
    assert dt.tzinfo is not None


def test_parse_created_before_invalid():
    with pytest.raises(ValueError):
        parse_created_before("not-a-date")


def test_parse_pending_duplicate_defaults_not_same():
    results = _parse_pending_duplicate_response("not json", 2)
    assert all(r["relevance_decision"] == "NOT_SAME" for r in results)


def test_request_validation_created_before_optional():
    req = PendingDuplicateCheckRequest(
        rephrased_query="What is wheat rust?",
        crop="Wheat",
        state="Uttar Pradesh",
        created_before="2026-05-31T12:10:16.649+00:00",
    )
    assert req.created_before is not None


def test_request_validation_question_id_only():
    req = PendingDuplicateCheckRequest(question_id="507f1f77bcf86cd799439011")
    assert req.question_id == "507f1f77bcf86cd799439011"


def test_request_validation_direct_mode_requires_all_fields():
    with pytest.raises(ValidationError):
        PendingDuplicateCheckRequest(rephrased_query="What is wheat rust?")


def test_request_validation_direct_mode_ok():
    req = PendingDuplicateCheckRequest(
        rephrased_query="What is wheat rust?",
        crop="Wheat",
        state="Uttar Pradesh",
    )
    assert req.rephrased_query == "What is wheat rust?"


@pytest.mark.asyncio
async def test_check_pending_duplicate_exact_bypass(monkeypatch):
    exact = [_cand("dup1", ref="ref1")]

    async def mock_exact(*_args, **_kwargs):
        return exact

    async def mock_vector(*_args, **_kwargs):
        raise AssertionError("vector search should not run on exact hit")

    async def mock_llm(*_args, **_kwargs):
        raise AssertionError("LLM should not run on exact hit")

    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.pending_exact_search",
        mock_exact,
    )
    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.pending_vector_search",
        mock_vector,
    )
    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.filter_pending_duplicate_batch",
        mock_llm,
    )

    result = await check_pending_duplicate(
        rephrased_query="same question text",
        crop="Wheat",
        state="Uttar Pradesh",
    )
    assert result["is_duplicate"] is True
    assert result["match_type"] == "exact"
    assert result["duplicate_question_id"] == "ref1"
    assert result["matched_question_id"] == "dup1"
    assert result["similarity_score"] == 0.8


@pytest.mark.asyncio
async def test_check_pending_duplicate_vector_llm_same(monkeypatch):
    vector = [_cand("v1"), _cand("v2")]

    async def mock_exact(*_args, **_kwargs):
        return []

    async def mock_vector(*_args, **_kwargs):
        return vector

    async def mock_llm(_query, candidates, **_kwargs):
        return [
            {"relevance_decision": "SAME", "relevance_reason": "same", "llm_parse_ok": True},
            {"relevance_decision": "NOT_SAME", "relevance_reason": "diff", "llm_parse_ok": True},
        ]

    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.pending_exact_search",
        mock_exact,
    )
    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.pending_vector_search",
        mock_vector,
    )
    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.filter_pending_duplicate_batch",
        mock_llm,
    )

    result = await check_pending_duplicate(
        rephrased_query="farmer question",
        crop="Wheat",
        state="Punjab",
    )
    assert result["is_duplicate"] is True
    assert result["match_type"] == "similarity"
    assert result["matched_question_id"] == "v1"
    assert result["duplicate_question_id"] == "v1"
    assert result["similarity_score"] == 0.8


@pytest.mark.asyncio
async def test_check_pending_duplicate_no_hits(monkeypatch):
    async def mock_exact(*_args, **_kwargs):
        return []

    async def mock_vector(*_args, **_kwargs):
        return []

    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.pending_exact_search",
        mock_exact,
    )
    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.pending_vector_search",
        mock_vector,
    )

    result = await check_pending_duplicate(
        rephrased_query="unique question",
        crop="Rice",
        state="Bihar",
    )
    assert result["is_duplicate"] is False
    assert result["duplicate_question_id"] is None
    assert result["match_type"] is None


@pytest.mark.asyncio
async def test_check_pending_duplicate_passes_created_before(monkeypatch):
    seen: dict = {}

    async def mock_exact(*_args, **kwargs):
        seen.update(kwargs)
        return []

    async def mock_vector(*_args, **kwargs):
        seen.update(kwargs)
        return []

    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.pending_exact_search",
        mock_exact,
    )
    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.pending_vector_search",
        mock_vector,
    )

    await check_pending_duplicate(
        rephrased_query="farmer question",
        crop="Wheat",
        state="Punjab",
        created_before="2026-05-31T12:10:16.649+00:00",
    )
    assert seen.get("created_before") is not None
    assert seen["created_before"].year == 2026


@pytest.mark.asyncio
async def test_check_pending_duplicate_llm_no_same(monkeypatch):
    vector = [_cand("v1")]

    async def mock_exact(*_args, **_kwargs):
        return []

    async def mock_vector(*_args, **_kwargs):
        return vector

    async def mock_llm(*_args, **_kwargs):
        return [
            {"relevance_decision": "NOT_SAME", "relevance_reason": "diff", "llm_parse_ok": True},
        ]

    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.pending_exact_search",
        mock_exact,
    )
    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.pending_vector_search",
        mock_vector,
    )
    monkeypatch.setattr(
        "ajrasakha.tools.golden.golden_pending_duplicate.filter_pending_duplicate_batch",
        mock_llm,
    )

    result = await check_pending_duplicate(
        rephrased_query="farmer question",
        crop="Wheat",
        state="Punjab",
    )
    assert result["is_duplicate"] is False
    assert len(result["candidates_checked"]) == 1
    assert result["candidates_checked"][0]["is_duplicate"] is False

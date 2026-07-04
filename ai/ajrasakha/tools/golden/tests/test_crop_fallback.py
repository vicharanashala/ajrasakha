"""Unit tests for crop=all retry when retrieval returns no hits."""

import pytest

from ajrasakha.tools.golden.golden_core import QuestionAnswerPair


def _pair(qid: str, score: float = 0.8) -> QuestionAnswerPair:
    return QuestionAnswerPair(
        question_id=qid,
        question_text=f"Q {qid}",
        answer_text=f"A {qid}",
        author=None,
        sources=[],
        similarity_score=score,
    )


@pytest.mark.asyncio
async def test_crop_fallback_retries_rag_with_all(monkeypatch):
    from ajrasakha.tools.golden import golden_search

    rag_calls: list[str] = []

    async def mock_strict(*_args, crop: str, **_kwargs):
        return []

    async def mock_rag(*args, **kwargs):
        crop_arg = kwargs.get("crop", args[1] if len(args) > 1 else "")
        rag_calls.append(crop_arg)
        if crop_arg == "all":
            return [_pair("fallback_hit")]
        return []

    async def mock_filter(*_args, **_kwargs):
        return [
            {
                "relevance_decision": "KEEP",
                "relevance_reason": "related",
                "llm_parse_ok": True,
            }
        ]

    async def mock_classify(*_args, **_kwargs):
        return {"classification": "SAME_INTENT", "reason": "match", "llm_parse_ok": True}

    async def mock_select(*_args, **_kwargs):
        return {
            "pair": _pair("fallback_hit"),
            "cls_result": {"classification": "SAME_INTENT"},
            "selection_rule": "single",
            "winning_class": "SAME_INTENT",
            "selection_method": "auto",
        }

    monkeypatch.setattr(golden_search, "strict_exact_search", mock_strict)
    monkeypatch.setattr(golden_search, "vector_rag_search", mock_rag)
    monkeypatch.setattr(golden_search, "filter_relevance_batch", mock_filter)
    monkeypatch.setattr(golden_search, "classify_pair", mock_classify)
    monkeypatch.setattr(golden_search, "select_best_match", mock_select)

    result = await golden_search.gdb_search("farmer question", "Unknown Crop", "Punjab")

    assert rag_calls == ["Unknown Crop", "all"]
    assert result["crop"] == "all"
    assert result["original_crop"] == "Unknown Crop"
    assert result["crop_fallback"] is True
    assert result["selected_match"]["question_id"] == "fallback_hit"
    assert result["classification_audit"]["crop_fallback"] is True


@pytest.mark.asyncio
async def test_no_retry_when_first_rag_returns_hits(monkeypatch):
    from ajrasakha.tools.golden import golden_search

    rag_calls: list[str] = []

    async def mock_strict(*_args, **_kwargs):
        return []

    async def mock_rag(*args, **kwargs):
        crop_arg = kwargs.get("crop", args[1] if len(args) > 1 else "")
        rag_calls.append(crop_arg)
        return [_pair("first_hit")]

    async def mock_filter(*_args, **_kwargs):
        return [
            {
                "relevance_decision": "SAME",
                "relevance_reason": "paraphrase",
                "llm_parse_ok": True,
            }
        ]

    monkeypatch.setattr(golden_search, "strict_exact_search", mock_strict)
    monkeypatch.setattr(golden_search, "vector_rag_search", mock_rag)
    monkeypatch.setattr(golden_search, "filter_relevance_batch", mock_filter)

    result = await golden_search.gdb_search("farmer question", "Wheat", "Punjab")

    assert rag_calls == ["Wheat"]
    assert result.get("crop_fallback") is None
    assert result["crop"] == "Wheat"
    assert result["selected_match"]["question_id"] == "first_hit"


@pytest.mark.asyncio
async def test_no_retry_when_crop_is_all(monkeypatch):
    from ajrasakha.tools.golden import golden_search

    rag_calls: list[str] = []

    async def mock_strict(*_args, **_kwargs):
        return []

    async def mock_rag(*args, **kwargs):
        crop_arg = kwargs.get("crop", args[1] if len(args) > 1 else "")
        rag_calls.append(crop_arg)
        return []

    monkeypatch.setattr(golden_search, "strict_exact_search", mock_strict)
    monkeypatch.setattr(golden_search, "vector_rag_search", mock_rag)

    result = await golden_search.gdb_search("farmer question", "all", "Punjab")

    assert rag_calls == ["all"]
    assert result.get("crop_fallback") is None
    assert result["crop"] == "all"
    assert result["selected_match"] is None


@pytest.mark.asyncio
async def test_crop_fallback_exact_match_on_retry(monkeypatch):
    from ajrasakha.tools.golden import golden_search

    strict_calls: list[str] = []

    async def mock_strict(*args, **kwargs):
        crop_arg = kwargs.get("crop", args[1] if len(args) > 1 else "")
        strict_calls.append(crop_arg)
        if crop_arg == "all":
            return [_pair("exact_fallback")]
        return []

    async def mock_rag(*_args, **_kwargs):
        return []

    monkeypatch.setattr(golden_search, "strict_exact_search", mock_strict)
    monkeypatch.setattr(golden_search, "vector_rag_search", mock_rag)

    result = await golden_search.gdb_search("farmer question", "Unknown Crop", "Punjab")

    assert strict_calls == ["Unknown Crop", "all"]
    assert result["crop"] == "all"
    assert result["crop_fallback"] is True
    assert result["exact_match"]["question_id"] == "exact_fallback"

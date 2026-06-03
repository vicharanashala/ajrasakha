"""Tests for GDB response normalization and merge dedupe/backfill."""

from ajrasakha.agents.gdb_agent import _normalize_gdb_response
from ajrasakha.tools.golden.golden_rag_tool import (
    QuestionAnswerPair,
    RETRIEVAL_SOURCE_ATLAS,
    RETRIEVAL_SOURCE_RAG,
    _build_merged_similar_match,
)


def test_normalize_gdb_response_preserves_question_id_exact_and_similar():
    raw = {
        "original_query": "wheat rust",
        "rephrased_query": "wheat rust treatment",
        "state": "Punjab",
        "crop": "Wheat",
        "exact_match": {
            "question_id": "507f1f77bcf86cd799439011",
            "similarity_score": None,
            "question": "How to treat wheat rust?",
            "answer": "Use fungicide X.",
            "details": [],
        },
        "similar_match": {
            "similar_pair1": {
                "question_id": "507f191e810c19729de860ea",
                "similarity_score": 0.92,
                "retrieval_source": "atlas",
                "question": "Rust on wheat leaves",
                "answer": "Spray when symptoms appear.",
                "details": [{"source_name": "KVK", "source_link": None, "author_name": None}],
            },
        },
    }

    result = _normalize_gdb_response(
        raw, query="wheat rust", rephrased="wheat rust treatment", crop="Wheat", state="Punjab"
    )

    assert result["is_exact"] is True
    assert result["exact_match"]["question_id"] == "507f1f77bcf86cd799439011"
    assert result["exact_match"]["similarity_score"] == 1
    assert result["is_similar"] is True
    assert result["similar_pair1"]["question_id"] == "507f191e810c19729de860ea"
    assert result["similar_pair1"]["similarity_score"] == 0.92
    assert result["similar_pair1"]["retrieval_source"] == "atlas"


def test_normalize_gdb_response_empty_question_id_when_missing():
    raw = {
        "exact_match": {
            "question": "Q",
            "answer": "A",
        },
        "similar_match": {
            "similar_pair1": {
                "question": "Q2",
                "answer": "A2",
            },
        },
    }

    result = _normalize_gdb_response(raw, query="q", rephrased="q", crop="all", state="all")

    assert result["exact_match"]["question_id"] == ""
    assert result["exact_match"]["similarity_score"] == 1
    assert result["similar_pair1"]["question_id"] == ""
    assert result["similar_pair1"]["similarity_score"] is None
    assert result["similar_pair1"]["retrieval_source"] is None


def _pair(qid: str, score: float | None = None) -> QuestionAnswerPair:
    return QuestionAnswerPair(
        question_id=qid,
        question_text=f"Q {qid}",
        answer_text=f"A {qid}",
        author=None,
        sources=[],
        similarity_score=score,
    )


def test_build_merged_similar_match_dedupes_and_backfills_to_five():
    atlas = [_pair("a1", 0.99), _pair("a2", 0.98), _pair("a3", 0.97), _pair("a4", 0.96)]
    vector = [_pair("a1", 0.95), _pair("v1", 0.94), _pair("v2", 0.93), _pair("v3", 0.92)]

    merged = _build_merged_similar_match(atlas, vector)

    assert len(merged) == 5
    ids = [merged[f"similar_pair{i}"]["question_id"] for i in range(1, 6)]
    assert ids == ["a1", "a2", "v1", "v2", "v3"]
    assert merged["similar_pair1"]["retrieval_source"] == RETRIEVAL_SOURCE_ATLAS
    assert merged["similar_pair3"]["retrieval_source"] == RETRIEVAL_SOURCE_RAG
    assert merged["similar_pair5"]["retrieval_source"] == RETRIEVAL_SOURCE_RAG

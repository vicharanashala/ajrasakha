"""Tests for GDB response normalization (Golden FastAPI)."""

import json

from ajrasakha.agents.gdb_agent import _normalize_gdb_response


def test_normalize_gdb_response_exact_match():
    raw = {
        "rephrased_query": "wheat pale tips",
        "state": "Uttar Pradesh",
        "crop": "Wheat",
        "exact_match": {
            "question_id": "507f1f77bcf86cd799439011",
            "similarity_score": 1,
            "retrieval_source": "strict_exact",
            "question": "Pale wheat tips?",
            "answer": "Apply nitrogen.",
            "details": [],
        },
        "selected_match": None,
        "classification_audit": {"status": "exact_bypass", "evaluations": []},
    }

    result = _normalize_gdb_response(
        raw, rephrased="wheat pale tips", crop="Wheat", state="Uttar Pradesh"
    )

    assert result["is_exact"] is True
    assert result["exact_match"]["question_id"] == "507f1f77bcf86cd799439011"
    assert result["exact_match"]["similarity_score"] == 1
    assert result["exact_match"]["chosen_for_answer"] is True
    assert result["chosen_for_answer"] is True
    assert result["chosen_question_id"] == "507f1f77bcf86cd799439011"
    assert result["is_similar"] is False
    assert result["classification_audit"]["status"] == "exact_bypass"


def test_normalize_gdb_response_selected_match_maps_to_similar_pair1():
    raw = {
        "rephrased_query": "pale tips on wheat",
        "state": "Uttar Pradesh",
        "crop": "Wheat",
        "exact_match": {},
        "selected_match": {
            "question_id": "507f191e810c19729de860ea",
            "similarity_score": 0.88,
            "retrieval_source": "rag",
            "gemma_class": "SAME_INTENT",
            "answer_from_class": "SAME_INTENT",
            "chosen_for_answer": True,
            "question": "Yellow tips on wheat",
            "answer": "Use urea.",
            "details": [],
        },
        "classification_audit": {
            "status": "selected",
            "answer_from_class": "SAME_INTENT",
            "selection_method": "tie_breaker",
            "chosen_for_answer": True,
            "evaluations": [
                {
                    "question_id": "507f191e810c19729de860ea",
                    "classification": "SAME_INTENT",
                    "chosen_for_answer": True,
                    "action": "selected",
                },
            ],
        },
    }

    result = _normalize_gdb_response(
        raw, rephrased="pale tips on wheat", crop="Wheat", state="Uttar Pradesh"
    )

    assert result["is_exact"] is False
    assert result["is_similar"] is True
    assert result["similar_pair1"]["question_id"] == "507f191e810c19729de860ea"
    assert result["similar_pair1"]["similarity_score"] == 0.88
    assert result["similar_pair1"]["gemma_class"] == "SAME_INTENT"
    assert result["similar_pair1"]["chosen_for_answer"] is True
    assert result["answer_from_class"] == "SAME_INTENT"
    assert result["chosen_for_answer"] is True
    assert result["chosen_question_id"] == "507f191e810c19729de860ea"
    assert "similar_pair2" not in result


def test_normalize_gdb_response_empty_when_no_selection():
    raw = {
        "exact_match": {},
        "selected_match": None,
        "classification_audit": {"status": "empty", "evaluations": []},
    }
    result = _normalize_gdb_response(raw, rephrased="q", crop="all", state="all")
    assert result["is_exact"] is False
    assert result["is_similar"] is False
    assert result["exact_match"] == {}

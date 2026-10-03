"""Tests for the isolated hybrid retrieval + Jev reranking experiment."""

import asyncio

import pytest

from ajrasakha.tools.golden.golden_core import QuestionAnswerPair
from ajrasakha.utils import jev_client, jev_tasks


def _pair(qid: str, question: str, score: float) -> QuestionAnswerPair:
    return QuestionAnswerPair(
        question_id=qid,
        question_text=question,
        answer_text=f"Stored answer for {question}",
        author=None,
        sources=[],
        similarity_score=score,
    )


def _result(*, task: float, evidence: float, target: float, coverage: float, conflict: float):
    answers = {
        "task_alignment": {
            "type": "choice",
            "choice": "SAME_TASK" if task >= 0.5 else "DIFFERENT_TASK",
            "probabilities": {
                "SAME_TASK": task,
                "PARTIAL_TASK": 0.0,
                "DIFFERENT_TASK": 1.0 - task,
            },
            "confidence": abs((2 * task) - 1),
        },
        "answer_evidence": {"type": "noul", "noul": evidence},
        "target_match": {"type": "noul", "noul": target},
        "complete_coverage": {"type": "noul", "noul": coverage},
        "has_conflict": {"type": "noul", "noul": conflict},
    }
    return jev_client.JevResult(
        answers=answers,
        model="jev-test",
        input_tokens=100,
        output_tokens=5,
        cost=0.001,
        latency_ms=25.0,
    )


def test_policy_rejects_sufficient_answer_for_wrong_task():
    policy = jev_tasks.golden_candidate_rerank_policy(
        {
            "task_alignment": "DIFFERENT_TASK",
            "task_probabilities": {"SAME_TASK": 0.2, "PARTIAL_TASK": 0.0, "DIFFERENT_TASK": 0.8},
            "same_task": 0.2,
            "answer_evidence": 0.9,
            "target_match": 0.9,
            "complete_coverage": 0.8,
            "has_conflict": 0.1,
        },
        task_threshold=0.5,
        evidence_threshold=0.5,
        target_threshold=0.5,
        max_conflict_probability=0.5,
    )
    assert policy["eligible"] is False
    assert policy["failed_gates"] == ["same_task"]


@pytest.mark.parametrize(
    "query",
    [
        "Asked about bud rot management for drumstick",
        "How can Fusarium flower rot be managed in tomato plants?",
        "Onion rot management",
    ],
)
def test_keyword_extraction_handles_multi_group_disease_patterns(query):
    from ajrasakha.tools.golden.keyword_extractor import extract_keywords

    keywords = extract_keywords(query, max_keywords=10)

    assert keywords
    assert any("rot" in keyword for keyword in keywords)


@pytest.mark.asyncio
async def test_reranker_selects_eligible_candidate_and_reports_usage(monkeypatch):
    from ajrasakha.tools.golden import golden_search

    wrong = _pair("wrong", "What is the availability of brinjal nursery?", 0.92)
    right = _pair("right", "How can I plant a brinjal nursery?", 0.88)

    async def no_exact(**_kwargs):
        return []

    async def candidates(*_args, **_kwargs):
        return [wrong, right], {
            "wrong": {"sources": ["semantic"], "source_ranks": {"semantic": 1}, "rrf_score": 0.02},
            "right": {"sources": ["keyword"], "source_ranks": {"keyword": 1}, "rrf_score": 0.02},
        }

    async def decide(_task, state, _questions):
        await asyncio.sleep(0)
        if "availability" in state["candidate_question"].lower():
            return _result(task=0.2, evidence=0.9, target=0.9, coverage=0.8, conflict=0.1)
        return _result(task=0.9, evidence=0.9, target=0.95, coverage=0.85, conflict=0.05)

    monkeypatch.setattr(golden_search, "strict_exact_search", no_exact)
    monkeypatch.setattr(golden_search, "_retrieve_rerank_candidates", candidates)
    monkeypatch.setattr(golden_search.jev_client, "adecide", decide)

    response = await golden_search.gdb_search_jev_reranked_eval(
        "Can you plant brinjal nursery?", "Brinjal", "Delhi"
    )

    audit = response["classification_audit"]
    assert response["selected_match"]["question_id"] == "right"
    assert audit["status"] == "selected"
    assert audit["jev"]["requests"] == 2
    assert audit["jev"]["input_tokens"] == 200
    wrong_eval = next(e for e in audit["evaluations"] if e["question_id"] == "wrong")
    assert wrong_eval["action"] == "rejected_by_gate"
    assert "same_task" in wrong_eval["failed_gates"]


@pytest.mark.asyncio
async def test_reranker_marks_close_top_candidates_for_review(monkeypatch):
    from ajrasakha.tools.golden import golden_search

    first = _pair("first", "First", 0.9)
    second = _pair("second", "Second", 0.89)

    async def no_exact(**_kwargs):
        return []

    async def candidates(*_args, **_kwargs):
        return [first, second], {
            "first": {"sources": ["semantic"], "source_ranks": {"semantic": 1}, "rrf_score": 0.02},
            "second": {"sources": ["semantic"], "source_ranks": {"semantic": 2}, "rrf_score": 0.019},
        }

    async def decide(_task, state, _questions):
        if state["candidate_question"] == "First":
            return _result(task=0.85, evidence=0.85, target=0.85, coverage=0.8, conflict=0.1)
        return _result(task=0.84, evidence=0.84, target=0.84, coverage=0.8, conflict=0.1)

    monkeypatch.setattr(golden_search, "strict_exact_search", no_exact)
    monkeypatch.setattr(golden_search, "_retrieve_rerank_candidates", candidates)
    monkeypatch.setattr(golden_search.jev_client, "adecide", decide)

    response = await golden_search.gdb_search_jev_reranked_eval(
        "question", "Wheat", "Punjab", review_margin=0.08
    )
    assert response["classification_audit"]["status"] == "review"
    assert response["selected_match"] is None
    assert response["classification_audit"]["proposed_match"]["selection_status"] == "review"


def test_reranker_route_is_registered():
    from ajrasakha.tools.golden.golden_api import app

    paths = {route.path for route in app.routes}
    assert "/v1/gdb/search-jev-reranked" in paths


def test_demo_includes_reranker():
    from pathlib import Path

    html = Path(__file__).parents[1].joinpath("golden_demo.html").read_text(encoding="utf-8")
    assert "Method 4" in html
    assert "/v1/gdb/search-jev-reranked" in html
    assert "100-question benchmark" in html
    assert "best automatic result" in html

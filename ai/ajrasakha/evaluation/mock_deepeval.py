"""Mock-mode DeepEval-compatible semantic metrics.

These metrics intentionally avoid external LLM/API calls. They keep the same
conceptual surface as DeepEval metrics so mock runs can demonstrate how answer
relevancy, faithfulness, and context relevancy will be reported once a real
DeepEval judge model is configured.
"""

from __future__ import annotations

import re
from typing import Any


DEEPEVAL_METRIC_LABELS = {
    "AnswerRelevancyMetric": "Answer Relevancy",
    "FaithfulnessMetric": "Faithfulness",
    "ContextualRelevancyMetric": "Contextual Relevancy",
}


STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "for",
    "how",
    "i",
    "in",
    "is",
    "it",
    "my",
    "of",
    "or",
    "should",
    "the",
    "to",
    "what",
}


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-zA-Z0-9]+", text.lower())
        if len(token) > 1 and token not in STOPWORDS
    }


def _overlap_score(left: str, right: str) -> int:
    left_tokens = _tokens(left)
    right_tokens = _tokens(right)
    if not left_tokens or not right_tokens:
        return 0
    return round(len(left_tokens & right_tokens) / len(left_tokens | right_tokens) * 100)


def _metric(passed: bool, score: int, reason: str) -> dict[str, Any]:
    return {
        "score": max(0, min(100, score)),
        "passed": passed,
        "reason": reason,
        "mode": "mock",
    }


def evaluate_answer_with_mock_deepeval(
    query: str,
    answer: str,
    context: list[str] | None = None,
) -> dict[str, dict[str, Any]]:
    """Evaluate semantic quality with deterministic mock DeepEval metrics."""
    context = context or []
    context_text = " ".join(context)

    if not answer.strip():
        return {
            key: _metric(False, 0, "answer_missing")
            for key in DEEPEVAL_METRIC_LABELS
        }

    answer_relevancy_score = max(
        _overlap_score(query, answer),
        _overlap_score(query, context_text),
    )
    context_relevancy_score = _overlap_score(query, context_text)
    faithfulness_score = _overlap_score(answer, context_text)
    context_supported = any(
        item.strip() and item.strip() in answer
        for item in context
    )
    if context_supported:
        faithfulness_score = 100
        answer_relevancy_score = max(answer_relevancy_score, 80)
        context_relevancy_score = max(context_relevancy_score, 80)

    has_context = bool(context_text.strip())
    coverage_gap = "coverage gap" in answer.lower() or "no reliable" in answer.lower()

    return {
        "AnswerRelevancyMetric": _metric(
            passed=answer_relevancy_score >= 25 and not coverage_gap,
            score=answer_relevancy_score,
            reason=(
                "question_answer_or_context_terms_overlap"
                if answer_relevancy_score >= 25 and not coverage_gap
                else "answer_not_relevant_enough_to_question"
            ),
        ),
        "FaithfulnessMetric": _metric(
            passed=has_context and faithfulness_score >= 20 and not coverage_gap,
            score=faithfulness_score if has_context else 0,
            reason=(
                "answer_terms_are_supported_by_retrieved_context"
                if has_context and faithfulness_score >= 20 and not coverage_gap
                else "answer_not_supported_by_retrieved_context"
            ),
        ),
        "ContextualRelevancyMetric": _metric(
            passed=has_context and context_relevancy_score >= 20,
            score=context_relevancy_score if has_context else 0,
            reason=(
                "retrieved_context_is_relevant_to_question"
                if has_context and context_relevancy_score >= 20
                else "retrieved_context_not_relevant_enough"
            ),
        ),
    }

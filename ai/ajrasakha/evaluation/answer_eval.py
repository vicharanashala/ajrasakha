"""Response quality evaluation wrapper invoking DeepEval."""

from __future__ import annotations

import logging
from typing import Any

from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval

logger = logging.getLogger(__name__)


def evaluate_response_quality(result: dict, enabled: bool = False) -> dict[str, Any]:
    """Evaluate quality of agent response using DeepEval when enabled."""
    if not enabled:
        return {
            "answer_quality_enabled": False,
            "answerrelevancymetric_score": "",
            "answerrelevancymetric_passed": "",
            "answerrelevancymetric_reason": "disabled",
            "faithfulnessmetric_score": "",
            "faithfulnessmetric_passed": "",
            "faithfulnessmetric_reason": "",
        }

    query = result.get("query", "")
    # Prioritize extracted final answer, fallback to response_text
    answer = result.get("final_answer") or result.get("response_text") or ""
    context = result.get("context") or []

    try:
        quality_eval = evaluate_answer_with_deepeval(
            query=query,
            answer=answer,
            context=context,
        )

        rel = quality_eval.get("AnswerRelevancyMetric", {})
        faith = quality_eval.get("FaithfulnessMetric", {})

        return {
            "answer_quality_enabled": True,
            "answerrelevancymetric_score": rel.get("score") if rel.get("score") is not None else "",
            "answerrelevancymetric_passed": rel.get("passed", False),
            "answerrelevancymetric_reason": rel.get("reason", ""),
            "faithfulnessmetric_score": faith.get("score") if faith.get("score") is not None else "",
            "faithfulnessmetric_passed": faith.get("passed", False),
            "faithfulnessmetric_reason": faith.get("reason", ""),
        }

    except Exception as exc:
        logger.error("Failed during response quality evaluation: %s", exc)
        return {
            "answer_quality_enabled": True,
            "answerrelevancymetric_score": "",
            "answerrelevancymetric_passed": False,
            "answerrelevancymetric_reason": f"error: {exc}",
            "faithfulnessmetric_score": "",
            "faithfulnessmetric_passed": False,
            "faithfulnessmetric_reason": f"error: {exc}",
        }
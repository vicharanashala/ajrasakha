import logging
import os

# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

load_dotenv()

from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
)
from deepeval.test_case import LLMTestCase

logger = logging.getLogger(__name__)

# Default threshold — used when caller doesn't specify one.
DEFAULT_THRESHOLD = 0.7


def _build_metric(metric_cls, threshold: float = DEFAULT_THRESHOLD):
    """
    Build a DeepEval metric with judge model selection.

    Priority:
      1. ANTHROPIC_API_KEY → Claude (via DeepEval's ClaudeModel)
      2. OPENAI_API_KEY   → OpenAI (DeepEval default)
      3. Neither          → log warning, still try (DeepEval may find a key elsewhere)
    """
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if anthropic_key:
        try:
            from deepeval.models import ClaudeModel

            judge_model = ClaudeModel(
                model="claude-3-5-sonnet-20241022"
            )

            return metric_cls(
                threshold=threshold,
                model=judge_model,
            )

        except Exception as exc:
            logger.warning(
                "Could not create ClaudeModel for %s: %s — falling back to default",
                metric_cls.__name__,
                exc,
            )
            return metric_cls(
                threshold=threshold,
            )

    if openai_key:
        return metric_cls(
            threshold=threshold,
        )

    logger.warning(
        "Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set. "
        "DeepEval scoring for %s may fail.",
        metric_cls.__name__,
    )
    return metric_cls(
        threshold=threshold,
    )


def _metric_passed(metric) -> bool:
    if hasattr(metric, "passed"):
        return bool(metric.passed)
    if hasattr(metric, "is_successful"):
        return bool(metric.is_successful())
    return False


def evaluate_answer_with_deepeval(
    query: str,
    answer: str,
    context: list[str] | None = None,
    threshold: float = DEFAULT_THRESHOLD,
):
    """Score an answer using DeepEval's AnswerRelevancy and Faithfulness metrics.

    Returns a dict keyed by metric class name, each containing:
        score (float | None), passed (bool), reason (str)
    """
    context = context or []

    if not answer or not str(answer).strip():
        return {
            "AnswerRelevancyMetric": {
                "score": None,
                "passed": False,
                "reason": "answer_missing",
            },
            "FaithfulnessMetric": {
                "score": None,
                "passed": False,
                "reason": "answer_missing",
            },
        }

    test_case = LLMTestCase(
        input=query,
        actual_output=answer,
        retrieval_context=context if context else ["No retrieval context available."],
    )

    metrics = [
        _build_metric(AnswerRelevancyMetric, threshold=threshold),
        _build_metric(FaithfulnessMetric, threshold=threshold),
    ]

    results = {}

    for metric in metrics:
        metric_name = metric.__class__.__name__

        try:
            metric.measure(test_case)

            results[metric_name] = {
                "score": metric.score,
                "passed": _metric_passed(metric),
                "reason": metric.reason,
            }

        except Exception as e:
            logger.warning(
                "DeepEval metric %s failed: %s",
                metric_name,
                e,
            )
            results[metric_name] = {
                "score": None,
                "passed": False,
                "reason": f"evaluator_error: {e}",
            }

    return results
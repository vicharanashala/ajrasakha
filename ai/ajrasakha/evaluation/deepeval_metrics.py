import os

from dotenv import load_dotenv

load_dotenv()

from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualRelevancyMetric,
)
from deepeval.test_case import LLMTestCase


def _build_metric(metric_cls, threshold: float = 0.5):
    """
    Build a DeepEval metric.

    DeepEval defaults to OpenAI unless a model is provided.
    Our project mainly has ANTHROPIC_API_KEY, so we try to use Claude.
    If ClaudeModel is not available in this DeepEval version, we fall back
    to default DeepEval behavior.
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
            return metric_cls(
                threshold=threshold,
            )

    if openai_key:
        return metric_cls(
            threshold=threshold,
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
):
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
            "ContextualRelevancyMetric": {
                "score": None,
                "passed": False,
                "reason": "answer_missing",
            },
        }

    test_case = LLMTestCase(
        input=query,
        actual_output=answer,
        retrieval_context=context,
    )

    metrics = [
        _build_metric(AnswerRelevancyMetric),
        _build_metric(FaithfulnessMetric),
        _build_metric(ContextualRelevancyMetric),
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
            results[metric_name] = {
                "score": None,
                "passed": False,
                "reason": str(e),
            }

    return results
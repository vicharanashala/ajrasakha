import os

from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualRelevancyMetric,
)
from deepeval.test_case import LLMTestCase


def _build_metric(metric_cls, threshold: float = 0.5):
    """
    Build a DeepEval metric with an AnthropicModel judge if
    ANTHROPIC_API_KEY is present, otherwise fall back to DeepEval
    defaults.

    Bug fixes applied (deepeval v4.0.7):
      (a) ClaudeModel -> AnthropicModel  (ClaudeModel does not exist in v4.0.7)
      (b) metric.passed  -> metric.success  (correct attribute name in v4.0.7)
      (c) retrieval_context field name is correct in LLMTestCase; no change needed
    """
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")

    if anthropic_key:
        try:
            from deepeval.models import AnthropicModel

            judge_model = AnthropicModel()
            return metric_cls(threshold=threshold, model=judge_model)
        except Exception:
            return metric_cls(threshold=threshold)

    return metric_cls(threshold=threshold)


def evaluate_answer_with_deepeval(
    query: str,
    answer: str,
    context: list[str] | None = None,
):
    """
    Run all three DeepEval metrics on a query/answer pair.

    Args:
        query:     the user question (maps to LLMTestCase.input)
        answer:    the agent's response (maps to LLMTestCase.actual_output)
        context:   list of retrieved context strings
                   (maps to LLMTestCase.retrieval_context)

    Returns:
        {
            "AnswerRelevancyMetric":    {"score": float, "passed": bool, "reason": str},
            "FaithfulnessMetric":       {"score": float, "passed": bool, "reason": str},
            "ContextualRelevancyMetric":{"score": float, "passed": bool, "reason": str},
        }
        On error, score=None and passed=False.
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
            # CORRECT attribute names (confirmed from installed deepeval v4.0.7):
            #   metric.score   -> float
            #   metric.success -> bool   (NOT metric.passed — bug in older code)
            #   metric.reason  -> str
            results[metric_name] = {
                "score": metric.score,
                "passed": metric.success,
                "reason": metric.reason,
            }

        except Exception as e:
            results[metric_name] = {
                "score": None,
                "passed": False,
                "reason": str(e),
            }

    return results
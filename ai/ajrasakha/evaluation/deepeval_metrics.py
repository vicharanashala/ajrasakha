import os

from dotenv import load_dotenv

load_dotenv()

from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualRelevancyMetric,
)
from deepeval.test_case import LLMTestCase

DEFAULT_JUDGE_MODEL = os.getenv("DEEPEVAL_JUDGE_MODEL", "claude-3-5-sonnet-20241022")

_judge_model_cache = None
_judge_model_resolved = False


def get_judge_model():
    """
    Returns a DeepEval-compatible judge model, preferring Claude per the
    project's tech stack ("Anthropic API as judge model").

    Cached after first resolution so we don't re-import/re-instantiate the
    model for every metric/test case. Falls back to None (DeepEval's own
    default, currently OpenAI) if Claude wiring isn't available in this
    environment, so the pipeline still runs somewhere rather than crashing.
    """
    global _judge_model_cache, _judge_model_resolved

    if _judge_model_resolved:
        return _judge_model_cache

    _judge_model_resolved = True
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")

    if anthropic_key:
        try:
            from deepeval.models import ClaudeModel

            _judge_model_cache = ClaudeModel(model=DEFAULT_JUDGE_MODEL)
        except Exception:
            _judge_model_cache = None

    return _judge_model_cache


def _build_metric(metric_cls, threshold: float = 0.5):
    model = get_judge_model()
    if model is not None:
        return metric_cls(threshold=threshold, model=model)
    return metric_cls(threshold=threshold)


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
    """
    Runs the three "generic" DeepEval metrics against a bot answer:

    - AnswerRelevancyMetric: did the answer address the farmer's question?
    - FaithfulnessMetric: is the answer grounded in the retrieved context,
      or did the system introduce something not present in the source?
    - ContextualRelevancyMetric: was the retrieved context itself relevant?

    `context` should be the retrieved GDB/tool text actually shown to the
    model (see executors.extract_retrieval_context_from_response) -- an
    empty context makes Faithfulness/ContextualRelevancy meaningless, so
    callers should populate it whenever a retrieval step ran.
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

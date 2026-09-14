import os

from dotenv import load_dotenv

load_dotenv()

from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualRelevancyMetric,
)
from deepeval.test_case import LLMTestCase


def _get_judge_model():
    """
    Resolve the judge model to use, in priority order:
    Anthropic Claude -> Groq (Llama/OSS via OpenAI-compatible API) -> None
    (None means: let DeepEval fall back to its own default, usually OpenAI).

    Brief specifies Anthropic as the intended judge model. Groq is used
    as a fallback here because Anthropic API credits were not purchased
    during development of this branch.
    """
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        try:
            from deepeval.models import ClaudeModel
            return ClaudeModel(model="claude-3-5-sonnet-20241022")
        except Exception:
            pass

    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            from deepeval.models import LocalModel
            return LocalModel(
                model="openai/gpt-oss-120b",
                base_url="https://api.groq.com/openai/v1/",
                api_key=groq_key,
            )
        except Exception:
            pass

    return None


def _build_metric(metric_cls, threshold: float = 0.5):
    """
    Build a DeepEval metric, using the shared judge model resolution
    order from _get_judge_model(). Falls back to DeepEval's own default
    (usually OpenAI) if no judge model could be built.
    """
    judge_model = _get_judge_model()
    if judge_model is not None:
        return metric_cls(threshold=threshold, model=judge_model)
    return metric_cls(threshold=threshold)

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

def evaluate_gdb_match(
    query: str,
    answer: str,
    expected_answer: str,
) -> dict:
    """
    GDB Match Score: how closely does the bot's answer match the
    expert-validated GDB reference answer for this query, using
    G-Eval (LLM-judged semantic comparison, not exact string match).
    """
    from deepeval.metrics import GEval
    from deepeval.test_case import LLMTestCaseParams

    if not expected_answer or not str(expected_answer).strip():
        return {
            "score": None,
            "passed": False,
            "reason": "no_gdb_reference_available",
        }

    if not answer or not str(answer).strip():
        return {
            "score": 0.0,
            "passed": False,
            "reason": "answer_missing",
        }

    try:
        metric = GEval(
            name="GDBMatchScore",
            evaluation_params=[
                LLMTestCaseParams.INPUT,
                LLMTestCaseParams.ACTUAL_OUTPUT,
                LLMTestCaseParams.EXPECTED_OUTPUT,
            ],
            criteria=(
                "Determine how closely the actual answer matches the "
                "expected expert-validated answer in factual content and "
                "meaning. The wording does not need to be identical, but "
                "key facts (numbers, recommendations, names) must match. "
                "Penalize missing or contradicting facts heavily."
            ),
            threshold=0.5,
            model=_get_judge_model(),
        )

        test_case = LLMTestCase(
            input=query,
            actual_output=answer,
            expected_output=expected_answer,
        )

        metric.measure(test_case)

        return {
            "score": metric.score,
            "passed": _metric_passed(metric),
            "reason": metric.reason,
        }

    except Exception as e:
        return {
            "score": None,
            "passed": False,
            "reason": str(e),
        }

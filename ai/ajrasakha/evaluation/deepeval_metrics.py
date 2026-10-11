import os

from dotenv import load_dotenv

load_dotenv()

from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualRelevancyMetric,
    GEval,
)
from deepeval.test_case import LLMTestCase
try:
    from deepeval.test_case import SingleTurnParams as LLMTestCaseParams
except ImportError:
    from deepeval.test_case import LLMTestCaseParams



def _get_judge_model():
    """
    Resolve the judge model for DeepEval metrics.
    Prefers available Gemini / OpenAI-compatible endpoint with active free-tier models.
    Supports Anthropic if configured.
    """
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        try:
            from deepeval.models import AnthropicModel

            return AnthropicModel(
                model=os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
            )
        except Exception:
            pass

    openai_key = os.getenv("OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY")
    if openai_key:
        try:
            from deepeval.models import OpenAIModel

            model_name = (
                os.getenv("DEEPEVAL_MODEL_NAME")
                or os.getenv("OPENAI_MODEL_NAME")
                or "gemini-3.5-flash-lite"
            )
            if model_name in ("gemini-1.5-flash", "models/gemini-1.5-flash", "gemini-2.5-flash"):
                model_name = "gemini-3.5-flash-lite"

            base_url = os.getenv(
                "OPENAI_BASE_URL",
                "https://generativelanguage.googleapis.com/v1beta/openai/",
            )
            return OpenAIModel(
                model=model_name,
                base_url=base_url,
                api_key=openai_key,
            )
        except Exception:
            pass

    return None


def _build_metric(metric_cls, threshold: float = 0.5):
    """
    Build a standard DeepEval metric.
    """
    judge_model = _get_judge_model()
    if judge_model:
        return metric_cls(
            threshold=threshold,
            model=judge_model,
        )
    return metric_cls(
        threshold=threshold,
    )


def _build_correctness_metric(threshold: float = 0.5):
    """
    Build a GEval metric for Answer Correctness against reference answers.
    """
    params = [
        LLMTestCaseParams.INPUT,
        LLMTestCaseParams.ACTUAL_OUTPUT,
        LLMTestCaseParams.EXPECTED_OUTPUT,
    ]
    criteria = (
        "Determine whether the actual output is factually accurate, "
        "complete, and semantically aligned with the expected expert reference output."
    )

    judge_model = _get_judge_model()
    if judge_model:
        return GEval(
            name="AnswerCorrectness",
            criteria=criteria,
            evaluation_params=params,
            threshold=threshold,
            model=judge_model,
        )

    return GEval(
        name="AnswerCorrectness",
        criteria=criteria,
        evaluation_params=params,
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
    expected_output: str | None = None,
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
            "AnswerCorrectness": {
                "score": None,
                "passed": False,
                "reason": "answer_missing",
            },
        }

    test_case = LLMTestCase(
        input=query,
        actual_output=answer,
        retrieval_context=context,
        expected_output=expected_output if expected_output else None,
    )

    metrics = [
        _build_metric(AnswerRelevancyMetric),
        _build_metric(FaithfulnessMetric),
        _build_metric(ContextualRelevancyMetric),
        _build_correctness_metric(),
    ]

    results = {}

    for metric in metrics:
        metric_name = getattr(metric, "name", None) or metric.__class__.__name__

        if metric.__class__.__name__ in ("FaithfulnessMetric", "ContextualRelevancyMetric") and not context:
            results[metric_name] = {
                "score": None,
                "passed": None,
                "reason": "Skipped: no retrieved context available",
            }
            continue

        if metric_name == "AnswerCorrectness" and not expected_output:
            results[metric_name] = {
                "score": None,
                "passed": None,
                "reason": "Skipped: no reference answer available",
            }
            continue

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


def _build_treatment_metric(threshold: float = 0.6):
    params = [
        LLMTestCaseParams.INPUT,
        LLMTestCaseParams.ACTUAL_OUTPUT,
        LLMTestCaseParams.EXPECTED_OUTPUT,
    ]
    criteria = (
        "Determine whether the recommended agricultural treatment, remedies, active chemical ingredients, "
        "dosages, and application timing in the actual output are factually correct, safe, and aligned with "
        "the verified expert reference output."
    )

    judge_model = _get_judge_model()
    if judge_model:
        return GEval(
            name="TreatmentCorrectness",
            criteria=criteria,
            evaluation_params=params,
            threshold=threshold,
            model=judge_model,
        )

    return GEval(
        name="TreatmentCorrectness",
        criteria=criteria,
        evaluation_params=params,
        threshold=threshold,
    )


def evaluate_treatment_with_deepeval(
    query: str,
    answer: str,
    expected_treatment: str,
    context: list[str] | None = None,
) -> dict:
    if not answer or not str(answer).strip():
        return {
            "score": None,
            "passed": False,
            "reason": "Response text is empty",
        }

    test_case = LLMTestCase(
        input=query,
        actual_output=answer,
        retrieval_context=context or [],
        expected_output=expected_treatment,
    )

    metric = _build_treatment_metric()
    try:
        metric.measure(test_case)
        return {
            "score": metric.score,
            "passed": _metric_passed(metric),
            "reason": metric.reason,
        }
    except Exception as exc:
        return {
            "score": None,
            "passed": False,
            "reason": f"Treatment GEval evaluation error: {exc}",
        }
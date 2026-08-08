import os

from dotenv import load_dotenv

load_dotenv()

from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualRelevancyMetric,
    GEval,
)
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

METRIC_NAMES = [
    "AnswerRelevancyMetric",
    "FaithfulnessMetric",
    "ContextualRelevancyMetric",
    "GDBMatchScore",
    "CropCorrectness",
    "TreatmentCorrectness",
    "RegionCorrectness",
]

# Facet-decomposed agricultural correctness: (metric_name, expected_value, label).
# Each facet is scored and reported independently rather than averaged into one
# opaque "Agricultural Accuracy" number, so a report can show e.g. "region wrong,
# crop correct" instead of one blended score.
#
# TreatmentCorrectness is NOT in this list - unlike crop/region (single factual
# labels an answer either names correctly or doesn't), "treatment" means real
# recommendation/dosage CONTENT, which a domain-name label can't stand in for.
# It used to be scored here as ("TreatmentCorrectness", "expected_domain", ...) -
# i.e. it checked whether the answer mentioned the *domain name* as a proxy for
# whether it got the treatment right, which is exactly the wrong thing (an
# answer could name "Soil" and still give a completely wrong dosage). It's now
# scored like GDBMatchScore, against real reference content - see
# questions.py's find_treatment_reference() for how that reference is sourced.
_AGRICULTURAL_FACETS = [
    ("CropCorrectness", "expected_crop", "crop"),
    ("RegionCorrectness", "expected_region", "region/state"),
]


def _build_judge_model():
    """
    Resolve a DeepEval judge model from whichever API key is configured.

    Preference order: GEMINI_API_KEY -> GROQ_API_KEY -> ANTHROPIC_API_KEY -> OPENAI_API_KEY ->
    DeepEval default. Every branch is wrapped so a missing package/key/import never throws
    here; on any failure it just falls through to the next option in the chain.
    """
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            from deepeval.models import GeminiModel

            return GeminiModel(
                model=os.getenv("GEMINI_MODEL_NAME", "gemini-flash-latest"),
                api_key=gemini_key,
            )
        except Exception:
            pass

    # Groq: no first-class DeepEval GroqModel exists (DeepEval's "GrokModel" is xAI's
    # different product). Groq exposes an OpenAI-compatible endpoint, so DeepEval's own
    # GPTModel(base_url=...) talks to it directly - confirmed working end-to-end (model
    # list + a real structured-output metric call) rather than assumed. GPTModel looks up
    # per-model capability data (supports_structured_outputs/supports_json_mode) keyed by
    # OpenAI model names; a Groq model name isn't in that table, so it falls back to
    # DeepEval's default capability data (both False/None) and takes the plain
    # chat.completions.create() + manual JSON-schema-parse path - the portable path that
    # doesn't depend on Groq supporting OpenAI's structured-output/JSON-mode endpoints.
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            from deepeval.models import GPTModel

            return GPTModel(
                model=os.getenv("GROQ_MODEL_NAME", "llama-3.3-70b-versatile"),
                api_key=groq_key,
                base_url="https://api.groq.com/openai/v1",
            )
        except Exception:
            pass

    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        try:
            from deepeval.models import ClaudeModel

            return ClaudeModel(
                model="claude-3-5-sonnet-20241022"
            )
        except Exception:
            pass

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        # DeepEval defaults to an OpenAI-backed model when none is passed explicitly.
        return None

    return None


def _build_metric(metric_cls, threshold: float = 0.5):
    """
    Build a DeepEval metric.

    Tries the configured judge model (see _build_judge_model). If building or
    passing that model fails for any reason, falls back to DeepEval's own default
    behavior so a bad/missing key never prevents the metric object from existing.
    """
    judge_model = _build_judge_model()

    try:
        if judge_model is not None:
            return metric_cls(threshold=threshold, model=judge_model)
        return metric_cls(threshold=threshold)
    except Exception:
        return metric_cls(threshold=threshold)


def _build_geval_metric(name: str, criteria: str, evaluation_params: list, threshold: float = 0.5):
    judge_model = _build_judge_model()

    kwargs = dict(
        name=name,
        criteria=criteria,
        evaluation_params=evaluation_params,
        threshold=threshold,
    )

    try:
        if judge_model is not None:
            return GEval(model=judge_model, **kwargs)
        return GEval(**kwargs)
    except Exception:
        return GEval(**kwargs)


def _metric_passed(metric) -> bool:
    if hasattr(metric, "passed"):
        return bool(metric.passed)
    if hasattr(metric, "is_successful"):
        return bool(metric.is_successful())
    return False


def _missing_answer_result() -> dict:
    return {
        name: {"score": None, "passed": False, "reason": "answer_missing"}
        for name in METRIC_NAMES
    }


def _score_against_reference(name: str, query: str, answer: str, reference: str | None, criteria: str, no_reference_reason: str) -> dict:
    """
    Shared by GDBMatchScore and TreatmentCorrectness: both compare the actual
    answer's CONTENT against a real reference answer via one G-Eval call,
    firing only when a real reference exists - N/A (not a fake score)
    otherwise. `no_reference_reason` lets each caller keep its own precise
    "why is this missing" reason.
    """
    if not reference or not str(reference).strip():
        return {"score": None, "passed": False, "reason": no_reference_reason}

    metric = _build_geval_metric(
        name=name,
        criteria=criteria,
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
    )
    reference_test_case = LLMTestCase(input=query, actual_output=answer, expected_output=reference)

    try:
        metric.measure(reference_test_case)
        return {"score": metric.score, "passed": _metric_passed(metric), "reason": metric.reason}
    except Exception as e:
        return {"score": None, "passed": False, "reason": str(e)}


def evaluate_answer_with_deepeval(
    query: str,
    answer: str,
    context: list[str] | None = None,
    reference_answer: str | None = None,
    reference_treatment: str | None = None,
    expected_crop: str | None = None,
    expected_region: str | None = None,
):
    context = context or []

    if not answer or not str(answer).strip():
        return _missing_answer_result()

    test_case = LLMTestCase(
        input=query,
        actual_output=answer,
        retrieval_context=context,
        expected_output=reference_answer or None,
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

    # GDB Match Score: compares the bot's answer against a reference/expert-validated
    # GDB answer for the same query.
    results["GDBMatchScore"] = _score_against_reference(
        name="GDB Match Score",
        query=query,
        answer=answer,
        reference=reference_answer,
        criteria=(
            "Determine how closely the 'actual output' matches the factual content, "
            "recommendation, and intent of the 'expected output' (a reference answer "
            "validated by an agriculture expert). Minor wording differences are fine; "
            "penalize missing, contradictory, or materially different facts."
        ),
        no_reference_reason="no_reference_answer",
    )

    # TreatmentCorrectness: compares the actual answer against real treatment/
    # dosage/recommendation CONTENT (see questions.py's find_treatment_reference)
    # - not a domain-label proxy (see _AGRICULTURAL_FACETS's comment above for
    # why that was wrong). `reference_treatment` is None both for domains with
    # no real/representative reference yet and for domains where "treatment"
    # isn't a coherent concept at all; the caller (answer_eval.py, via
    # questions.py) is the one that knows which - this function only sees
    # "no reference" either way, hence the generic reason here.
    results["TreatmentCorrectness"] = _score_against_reference(
        name="TreatmentCorrectness",
        query=query,
        answer=answer,
        reference=reference_treatment,
        criteria=(
            "Determine whether the 'actual output' correctly conveys the treatment, "
            "dosage, or recommendation described in the 'expected output' (a reference "
            "answer for this domain). Minor wording differences are fine; penalize "
            "missing, contradictory, or materially different treatment/dosage facts."
        ),
        no_reference_reason="no_reference_treatment",
    )

    # Facet-decomposed agricultural correctness: crop and region are each
    # scored independently so a wrong region doesn't drag down a correct crop
    # score (or vice versa) - see _AGRICULTURAL_FACETS above.
    expected_values = {
        "expected_crop": expected_crop,
        "expected_region": expected_region,
    }

    for metric_name, expected_key, label in _AGRICULTURAL_FACETS:
        expected_value = expected_values[expected_key]

        if not expected_value:
            results[metric_name] = {
                "score": None,
                "passed": False,
                "reason": "no_expected_metadata",
            }
            continue

        facet_test_case = LLMTestCase(
            input=query,
            actual_output=answer,
            expected_output=f"An answer that correctly references {label} '{expected_value}'.",
        )

        facet_metric = _build_geval_metric(
            name=metric_name,
            criteria=(
                f"Check whether the 'actual output' correctly names and addresses "
                f"{label} '{expected_value}', where the question specifies it. "
                f"Penalize a wrong or missing {label}."
            ),
            evaluation_params=[
                LLMTestCaseParams.INPUT,
                LLMTestCaseParams.ACTUAL_OUTPUT,
                LLMTestCaseParams.EXPECTED_OUTPUT,
            ],
        )

        try:
            facet_metric.measure(facet_test_case)

            results[metric_name] = {
                "score": facet_metric.score,
                "passed": _metric_passed(facet_metric),
                "reason": facet_metric.reason,
            }

        except Exception as e:
            results[metric_name] = {
                "score": None,
                "passed": False,
                "reason": str(e),
            }

    return results

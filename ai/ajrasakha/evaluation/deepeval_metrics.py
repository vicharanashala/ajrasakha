import os
import functools
from typing import Optional
from dataclasses import dataclass, field
from pathlib import Path
from dotenv import load_dotenv

from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualRelevancyMetric,
    GEval,
)
from deepeval.metrics.g_eval import Rubric
from deepeval.test_case import LLMTestCase, SingleTurnParams
from deepeval.models import AnthropicModel, OpenAIModel

# ============================================================
# 1. LOAD ENVIRONMENT CONFIGURATION
# ============================================================

# Load the .env file from the ai/ directory.
# This allows us to keep API keys and judge configuration
# outside the source code.
# Loading happens once when this module is imported.

env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)


# Default judge model used when JUDGE_MODEL is not specified.

DEFAULT_JUDGE_MODEL = "claude-sonnet-4-6"

class JudgeSetupError(RuntimeError):
    pass


# Criteria for the GDB reference-agreement metric. v1 has no calibrated pass
# threshold; the score expresses semantic agreement with a synthetic reference.
GDB_MATCH_CRITERIA = (
    "Compare the actual answer with the expected answer for the farmer's "
    "question. Score semantic agreement with the expected guidance. Reward "
    "coverage of the relevant agricultural practices, correct crop identity "
    "(paddy/rice), and regional relevance (Punjab); penalise contradictory, "
    "unsafe, or materially missing guidance. Do not require identical wording, "
    "length, structure, or formatting; a faithful paraphrase must score highly."
)


class GDBMatchMetric(GEval):
    """GEval specialised for reference-answer agreement."""


# Dimensions evaluated independently. The scoring layer decides which apply;
# the judge only ever sees one dimension at a time.
AGRICULTURAL_DIMENSIONS = ("crop", "region", "cultivation_guidance")

# Shared 0-10 rubric. DeepEval normalises the ranges to [0, 1] using the first
# start and last end, so 0-3 -> 0.0-0.3, 4-6 -> 0.4-0.6 and 7-10 -> 0.7-1.0.
# The scoring layer maps those back to the 0.0 / 0.5 / 1.0 anchors.
AGRICULTURAL_RUBRIC = [
    Rubric(
        score_range=(0, 3),
        expected_outcome=(
            "Explicit contradiction only: the answer names a different "
            "explicit crop, names a different explicit state, or gives advice "
            "that conflicts with the supplied cultivation guidance reference. Use this "
            "band only when the contradiction is clear; do not use it for "
            "omitted, incomplete or uncertain details."
        ),
    ),
    Rubric(
        score_range=(4, 6),
        expected_outcome=(
            "Omitted, incomplete, only partially supported, or uncertain. Use "
            "this band when the answer leaves out the expected detail, only "
            "partly matches it, or when it is not possible to tell reliably "
            "whether the detail is omitted or contradicted. State that "
            "uncertainty in the reason."
        ),
    ),
    Rubric(
        score_range=(7, 10),
        expected_outcome=(
            "Correct and fully supported by the supplied expectation. The "
            "expected crop, region or cultivation guidance is clearly and accurately "
            "reflected in the answer, allowing equivalent crop names such as "
            "Paddy and Rice."
        ),
    ),
]

AGRICULTURAL_CRITERIA = {
    "crop": (
        "Evaluate only the crop identity in the actual output against the crop "
        "expectation supplied in the context. Paddy and Rice are equivalent "
        "names for the same crop, so either name must count as correct. A "
        "different explicit crop, or advice that applies to a different crop "
        "than expected, is an explicit contradiction. If the actual output "
        "does not mention a crop at all, treat the crop as omitted rather than "
        "contradictory. Do not infer or fill missing crop information from the "
        "question, outside knowledge or general agricultural assumptions."
    ),
    "region": (
        "Evaluate only the region (state, and optional city) in the actual "
        "output against the region expectation supplied in the context. Reward "
        "an answer that names the expected state. An answer that names the "
        "expected state but omits the expected city, or names a different "
        "city, is partial rather than contradictory. A different explicit "
        "state is an explicit contradiction. If no state is mentioned, treat "
        "the region as omitted rather than contradictory. Do not infer a state "
        "from a city name or any other indirect clue, and do not use outside "
        "knowledge to fill gaps."
    ),
    "cultivation_guidance": (
        "Evaluate only how the actual output presents cultivation guidance compared "
        "with the cultivation guidance reference supplied in the context. Reward agreement "
        "with the supplied reference; a faithful paraphrase of that reference "
        "must score highly. Advice that explicitly conflicts with the supplied "
        "reference is an explicit contradiction. If the actual output omits the "
        "reference details, treat them as omitted or partial rather than "
        "contradictory. Do not reward or penalise content using external "
        "agricultural assumptions or your own knowledge. The supplied reference "
        "may be labelled synthetic_manual; it is not an ACE GDB answer and must "
        "not be treated as expert-validated ground truth."
    ),
}


class AgriculturalAccuracyMetric(GEval):
    """One GEval specialised for one explicit agricultural dimension."""


# ============================================================
# 2. JUDGE CONFIGURATION
# ============================================================

@dataclass
class JudgeConfig:
    provider: str
    model: str
    api_key: str = field(repr=False)
    base_url: Optional[str] = None

def load_judge_config() -> JudgeConfig:
    provider = os.getenv("JUDGE_PROVIDER", "anthropic").lower()
    model = os.getenv("JUDGE_MODEL", DEFAULT_JUDGE_MODEL)
    base_url = os.getenv("JUDGE_BASE_URL")
    
    if provider == "anthropic":
        api_key = os.getenv("JUDGE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    elif provider == "openai":
        api_key = os.getenv("JUDGE_API_KEY") or os.getenv("OPENAI_API_KEY")
    else:
        raise JudgeSetupError(f"Unknown JUDGE_PROVIDER='{provider}'. Use 'anthropic' or 'openai'.")
        
    if not api_key:
        raise JudgeSetupError(f"API_KEY not set. Add JUDGE_API_KEY (or {provider.upper()}_API_KEY) to ai/.env.")
        
    return JudgeConfig(provider=provider, model=model, base_url=base_url, api_key=api_key)

# ============================================================
# 3. INITIALIZE AND CACHE THE JUDGE MODEL
# ============================================================

@functools.lru_cache(maxsize=1)
def get_judge_model():

    """
    Initialize the configured LLM judge.
    The judge is seperate from the Ajrasakha model that generates
    the original answer. It evaluates that answer using Deepeval.

    lru_cache(maxsize=1) ensures that the model object is reused
    instead of being recreated for every evaluation
    """

    config = load_judge_config()
    kwargs = {"model": config.model, "api_key": config.api_key}
    if config.base_url:
        kwargs["base_url"] = config.base_url
        
    try:
        if config.provider == "anthropic":
            return AnthropicModel(**kwargs)
        return OpenAIModel(**kwargs)
    except Exception as exc:
        raise JudgeSetupError(
            f"couldn't set up the judge: {exc}"
        ) from exc
# ============================================================
# 4. DEEPEVAL METRIC HELPERS
# ============================================================

def _build_metric(metric_cls, model, threshold: float = 0.5):
    """
    Create deepeval metric using the configured judge model.
    metric_cls: The Deepeval metric class to instantiate.
    model: The LLM judge used to evaluate the metric.
    Threshold: Minimum score required for passing result.
    """
    return metric_cls(threshold=threshold, model=model)

def _metric_passed(metric) -> bool:
    
    """
    determine whether a metric passed its evaluation threshold.
    Supports both the 'passed' attribute and the 'is_successful()' method,
    depending on the metric interface.
    """

    if hasattr(metric, "passed"):
        return bool(metric.passed)
    if hasattr(metric, "is_successful"):
        return bool(metric.is_successful())
    return False


def _build_gdb_match_metric(model):
    """Build the reference-agreement metric with no v1 pass threshold."""
    return GDBMatchMetric(
        name="GDBMatchMetric",
        criteria=GDB_MATCH_CRITERIA,
        evaluation_params=[
            SingleTurnParams.INPUT,
            SingleTurnParams.ACTUAL_OUTPUT,
            SingleTurnParams.EXPECTED_OUTPUT,
        ],
        threshold=None,
        model=model,
    )


def _build_agricultural_metric(model, dimension):
    """Build the one-dimension agricultural metric with no pass threshold.

    ``dimension`` must be one of :data:`AGRICULTURAL_DIMENSIONS`. The
    expectation text is supplied as ``context`` by the scoring layer.
    """
    if dimension not in AGRICULTURAL_CRITERIA:
        raise ValueError(
            f"unknown agricultural dimension: {dimension!r}"
        )
    return AgriculturalAccuracyMetric(
        name="AgriculturalAccuracyMetric",
        criteria=AGRICULTURAL_CRITERIA[dimension],
        evaluation_params=[
            SingleTurnParams.INPUT,
            SingleTurnParams.ACTUAL_OUTPUT,
            SingleTurnParams.CONTEXT,
        ],
        rubric=AGRICULTURAL_RUBRIC,
        threshold=None,
        model=model,
    )

# Export the agricultural scorer, enabling it to be patched by answer-eval tests
# while preventing the module from loading the judge configuration.
from .agricultural_scoring import evaluate_agricultural_accuracy

def evaluate_answer_with_deepeval(
    query: str,
    answer: str,
    context: list[str] | None = None,
    expected_output: str | None = None,
):
    """
    Evaluate an ajrasakha response using three DeepEval metrics plus an
    optional reference-agreement metric.

    inputs:
        query: Original question asked by the farmer.
        answer: Final answer generated by the ajrasakha.
        context: Retrieved information used to generate the answer.
        expected_output: Optional synthetic reference answer. When absent, the
            GDB match metric is reported as not applicable.

    returns:
        A dictionary containing the score, pass/fail status,
        and evaluation reason for each metric.
    """

    #use an empty list when no retrieval context is provided.
    context = context or []

    # Normalise the optional reference so whitespace counts as absent.
    reference = str(expected_output or "").strip()

    # Do not send an empty answer to the judge.
    # Return a consistent result structure instead.
    if not answer or not str(answer).strip():
        return {
            "AnswerRelevancyMetric": {"score": None, "passed": False, "reason": "answer_missing"},
            "FaithfulnessMetric": {"score": None, "passed": False, "reason": "answer_missing"},
            "ContextualRelevancyMetric": {"score": None, "passed": False, "reason": "answer_missing"},
            "GDBMatchMetric": {"score": None, "passed": None, "reason": "answer_missing"},
        }

    # Get the configured judge model
    judge_model = get_judge_model()

    # package the question, generate answer and retrieved context
    # into the test-case format expected by DeepEval.
    test_case = LLMTestCase(
        input=query,
        actual_output=answer,
        retrieval_context=context,
        expected_output=reference or None,
        )

    #create the three evaluation metrics.
    #all three uses the same configured judge model
    metrics = [
        _build_metric(AnswerRelevancyMetric, judge_model),
        _build_metric(FaithfulnessMetric, judge_model),
        _build_metric(ContextualRelevancyMetric, judge_model),
    ]

    # Build the reference-agreement metric only when a reference exists.
    # Ordinary construction failures are isolated; setup failures propagate.
    gdb_setup_error = None
    if reference:
        try:
            metrics.append(_build_gdb_match_metric(judge_model))
        except JudgeSetupError:
            raise
        except Exception as exc:
            gdb_setup_error = str(exc)

    results = {}

    #evaluate each metric independently.
    #if one metric fails, the remaining metrics can still run
    for metric in metrics:
        metric_name = metric.__class__.__name__
        is_gdb = metric_name == "GDBMatchMetric"
        try:
            #ask DeepEval to evaluate the test case using this metric.
            metric.measure(test_case)

            #collect the evaluation output.

            results[metric_name] = {
                "score": metric.score,
                # v1 has no calibrated GDB threshold, so passed stays unknown.
                "passed": None if is_gdb else _metric_passed(metric),
                "reason": metric.reason,
            }
        except JudgeSetupError:
            # Setup failures stop the run rather than becoming a metric row.
            raise
        except Exception as e:
            # Record the error for this metric without stopping.
            # the evaluation of the other metrics.
            results[metric_name] = {
                "score": None,
                "passed": None if is_gdb else False,
                "reason": str(e),
            }

    if gdb_setup_error is not None:
        results["GDBMatchMetric"] = {
            "score": None,
            "passed": None,
            "reason": f"gdb_match_setup_error: {gdb_setup_error}",
        }
    elif not reference:
        results["GDBMatchMetric"] = {
            "score": None,
            "passed": None,
            "reason": "no_expected_answer",
        }

    return results

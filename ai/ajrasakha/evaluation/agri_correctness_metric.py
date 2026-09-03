"""
Custom agricultural correctness metric.

The original project brief for the Answer Evaluation Pipeline calls for:

    "Custom agricultural metric: did the answer mention the correct crop,
    correct treatment, and correct region where applicable?"

That metric never existed in the codebase — only a keyword-based banned
chemicals check did (validators/banned_chemicals.py), which is a safety
filter, not a correctness scorer. This module fills that gap using
DeepEval's GEval (LLM-as-judge) framework, consistent with how the other
DeepEval-based metrics in deepeval_metrics.py are built.

Ground truth for crop / region is pulled from the existing test case
fields (case["expected_plan"]["crop"], case["location"]["state"]) so no
new ground truth needs to be authored for most cases. Treatment ground
truth is opt-in via a new "expected_treatment" field on a test case,
since not every case has a prescribed treatment.
"""

import os

from dotenv import load_dotenv

load_dotenv()

from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams


def _judge_model():
    """
    Reuse the same judge-model selection logic as deepeval_metrics.py:
    prefer Claude when ANTHROPIC_API_KEY is present, otherwise fall back
    to DeepEval's default (OpenAI).
    """
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")

    if anthropic_key:
        try:
            from deepeval.models import ClaudeModel

            return ClaudeModel(model="claude-3-5-sonnet-20241022")
        except Exception:
            return None

    return None


def _build_expected_output(expected_crop: str | None, expected_treatment: str | None, expected_region: str | None) -> str:
    """
    Turn the ground-truth fields into a short natural-language description
    that GEval can compare the actual answer against. Only include facts
    that are actually known for this case.
    """
    parts = []

    if expected_crop and str(expected_crop).lower() not in {"all", "none", ""}:
        parts.append(f"the crop is {expected_crop}")

    if expected_treatment:
        parts.append(f"the recommended treatment/practice is {expected_treatment}")

    if expected_region:
        parts.append(f"the advice is applicable to {expected_region}")

    if not parts:
        return ""

    return "A correct answer should reflect that " + "; ".join(parts) + "."


def extract_agri_ground_truth(case: dict) -> dict:
    """
    Pull crop / treatment / region ground truth out of an existing test
    case dict. Crop and region are read from fields that already exist on
    every case; treatment is opt-in via "expected_treatment".
    """
    expected_plan = case.get("expected_plan", {}) or {}
    location = case.get("location", {}) or {}

    expected_crop = expected_plan.get("crop")
    expected_region = location.get("state")
    expected_treatment = case.get("expected_treatment")

    return {
        "expected_crop": expected_crop,
        "expected_treatment": expected_treatment,
        "expected_region": expected_region,
    }


def evaluate_agri_correctness(
    query: str,
    answer: str,
    case: dict,
    threshold: float = 0.6,
) -> dict:
    """
    Score whether the answer correctly reflects the expected crop,
    treatment, and region for this case.

    Skips (not required) when the case carries no crop/treatment/region
    ground truth worth checking, e.g. general/weather/greeting questions
    where "crop" is "all" and no treatment is expected.
    """
    ground_truth = extract_agri_ground_truth(case)

    expected_output = _build_expected_output(
        ground_truth["expected_crop"],
        ground_truth["expected_treatment"],
        ground_truth["expected_region"],
    )

    if not expected_output:
        return {
            "agri_correctness_required": False,
            "agri_correctness_score": None,
            "agri_correctness_pass": True,
            "agri_correctness_reason": "no crop/treatment/region ground truth for this case",
            "agri_correctness_expected_crop": ground_truth["expected_crop"] or "",
            "agri_correctness_expected_treatment": ground_truth["expected_treatment"] or "",
            "agri_correctness_expected_region": ground_truth["expected_region"] or "",
        }

    if not answer or not str(answer).strip():
        return {
            "agri_correctness_required": True,
            "agri_correctness_score": None,
            "agri_correctness_pass": False,
            "agri_correctness_reason": "answer_missing",
            "agri_correctness_expected_crop": ground_truth["expected_crop"] or "",
            "agri_correctness_expected_treatment": ground_truth["expected_treatment"] or "",
            "agri_correctness_expected_region": ground_truth["expected_region"] or "",
        }

    test_case = LLMTestCase(
        input=query,
        actual_output=answer,
        expected_output=expected_output,
    )

    metric_kwargs = dict(
        name="Agricultural Correctness",
        criteria=(
            "Determine whether the actual output correctly identifies and "
            "addresses the crop, treatment/practice, and region described in "
            "the expected output. Penalize answers that name the wrong crop, "
            "recommend a mismatched treatment, or give region-inappropriate "
            "advice. Do not penalize the answer for including additional, "
            "correct information beyond what the expected output states."
        ),
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        threshold=threshold,
    )

    judge_model = _judge_model()
    if judge_model is not None:
        metric_kwargs["model"] = judge_model

    metric = GEval(**metric_kwargs)

    try:
        metric.measure(test_case)

        passed = bool(metric.score is not None and metric.score >= threshold)

        return {
            "agri_correctness_required": True,
            "agri_correctness_score": metric.score,
            "agri_correctness_pass": passed,
            "agri_correctness_reason": metric.reason,
            "agri_correctness_expected_crop": ground_truth["expected_crop"] or "",
            "agri_correctness_expected_treatment": ground_truth["expected_treatment"] or "",
            "agri_correctness_expected_region": ground_truth["expected_region"] or "",
        }

    except Exception as e:
        return {
            "agri_correctness_required": True,
            "agri_correctness_score": None,
            "agri_correctness_pass": False,
            "agri_correctness_reason": str(e),
            "agri_correctness_expected_crop": ground_truth["expected_crop"] or "",
            "agri_correctness_expected_treatment": ground_truth["expected_treatment"] or "",
            "agri_correctness_expected_region": ground_truth["expected_region"] or "",
        }

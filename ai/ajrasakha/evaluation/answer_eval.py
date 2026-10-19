"""
Answer quality evaluation for the Ajrasakha stable suite.

This is the integration point Project 3 asks for: it wires DeepEval
(Answer Relevancy, Faithfulness, Contextual Relevancy), the GDB Match
Score, and the custom agricultural accuracy metric (crop/treatment/region)
into a single per-test-case quality score breakdown, instead of only
reporting whether the pipeline ran.

Previously this function was a hardcoded stub that always returned
`answer_quality_enabled: False` regardless of the `enabled` flag passed
in -- so `deepeval_metrics.py` existed but nothing in the stable suite
actually called it. That's the gap this file closes.
"""
from __future__ import annotations

import json

from deepeval.test_case import LLMTestCase

from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval
from ajrasakha.evaluation.gdb_match import evaluate_gdb_match, resolve_expected_answer
from ajrasakha.evaluation.agri_metrics import AgriAccuracyMetric

# Relative weight of each metric in the overall quality score. Faithfulness
# is weighted highest because an unfaithful (hallucinated) answer is the
# most dangerous failure mode for a farmer-facing bot. Metrics that aren't
# applicable to a given case (score=None) are excluded and the remaining
# weights are renormalised, so e.g. a weather question isn't penalised for
# not having a GDB match score.
QUALITY_METRIC_WEIGHTS = {
    "AnswerRelevancyMetric": 0.25,
    "FaithfulnessMetric": 0.30,
    "ContextualRelevancyMetric": 0.15,
    "GDBMatchScore": 0.15,
    "AgriAccuracyMetric": 0.15,
}

QUALITY_PASS_THRESHOLD = 0.6


def _evaluate_agri_metric(query: str, answer: str, case: dict) -> dict:
    metric = AgriAccuracyMetric()
    location = case.get("location") or {}

    test_case = LLMTestCase(
        input=query,
        actual_output=answer or "",
        metadata={
            "expected_crop": case.get("expected_crop"),
            "expected_region": case.get("expected_region") or location.get("state"),
            "expected_treatment": case.get("expected_treatment"),
        },
    )

    try:
        metric.measure(test_case)
        return {"score": metric.score, "passed": metric.is_successful(), "reason": metric.reason}
    except Exception as exc:
        return {"score": None, "passed": False, "reason": str(exc)}


def _overall_quality_score(metric_results: dict) -> float | None:
    weighted_total = 0.0
    weight_used = 0.0

    for name, weight in QUALITY_METRIC_WEIGHTS.items():
        result = metric_results.get(name) or {}
        score = result.get("score")
        if score is None:
            continue
        weighted_total += score * weight
        weight_used += weight

    if weight_used == 0:
        return None

    return round(weighted_total / weight_used, 4)


def evaluate_response_quality(result: dict, case: dict, enabled: bool = False) -> dict:
    """
    Args:
        result: the dict returned by run_mock_case/run_live_case, expected
            to contain `answer` (clean final-answer text) and, ideally,
            `retrieval_context` (list of retrieved GDB/tool text).
        case: the test case dict from questions.TEST_CASES.
        enabled: only run the (LLM-judged, so slow/costly) metrics when
            True -- callers gate this on live mode so mock runs stay fast
            and free.
    """
    if not enabled:
        return {
            "answer_quality_enabled": False,
            "quality_overall_score": "",
            "quality_pass": "",
            "quality_breakdown": "",
        }

    query = case.get("query", "")
    answer = result.get("answer") or result.get("response_text", "")
    context = result.get("retrieval_context") or []
    expected_answer = resolve_expected_answer(case)

    deepeval_scores = evaluate_answer_with_deepeval(query, answer, context)
    gdb_match = evaluate_gdb_match(query, answer, expected_answer)
    agri = _evaluate_agri_metric(query, answer, case)

    metric_results = {
        **deepeval_scores,
        "GDBMatchScore": gdb_match,
        "AgriAccuracyMetric": agri,
    }

    overall = _overall_quality_score(metric_results)
    quality_pass = overall is not None and overall >= QUALITY_PASS_THRESHOLD

    flat: dict = {
        "answer_quality_enabled": True,
        "quality_overall_score": overall,
        "quality_pass": quality_pass,
    }

    for metric_name, values in metric_results.items():
        prefix = metric_name.lower()
        flat[f"{prefix}_score"] = values.get("score")
        flat[f"{prefix}_passed"] = values.get("passed")
        flat[f"{prefix}_reason"] = values.get("reason")

    # Kept as a single JSON column too, so downstream consumers (Postgres
    # storage, dashboard) don't have to know every flattened column name.
    flat["quality_breakdown"] = json.dumps(metric_results, default=str)

    return flat

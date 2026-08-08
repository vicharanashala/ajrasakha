from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval


def _disabled_stub() -> dict:
    return {
        "answer_quality_enabled": False,
        "answerrelevancymetric_score": "",
        "answerrelevancymetric_passed": "",
        "answerrelevancymetric_reason": "disabled",
    }


def evaluate_response_quality(result: dict, case: dict | None = None, enabled: bool = False) -> dict:
    if not enabled:
        return _disabled_stub()

    case = case or {}

    query = result.get("query", "")
    answer = result.get("response_text", "")
    context = result.get("context") or result.get("retrieval_context") or []

    expected_plan = case.get("expected_plan", {}) or {}
    expected_crop = expected_plan.get("crop")
    if expected_crop in (None, "all"):
        expected_crop = None

    scores = evaluate_answer_with_deepeval(
        query,
        answer,
        context,
        reference_answer=case.get("expected_answer"),
        reference_treatment=case.get("expected_treatment"),
        expected_crop=expected_crop,
        expected_region=expected_plan.get("state"),
    )

    flattened = {
        "answer_quality_enabled": True,
        # Why TreatmentCorrectness fired, was N/A for a data gap, or was N/A
        # because "treatment" doesn't apply to this domain at all - see
        # questions.py's find_treatment_reference(). Not a metric score
        # itself, so it's added directly rather than via the metrics loop
        # below.
        "treatment_reference_source": case.get("treatment_reference_source"),
    }

    for metric_name, metric_result in scores.items():
        key_prefix = metric_name.lower()
        flattened[f"{key_prefix}_score"] = metric_result.get("score")
        flattened[f"{key_prefix}_passed"] = metric_result.get("passed")
        flattened[f"{key_prefix}_reason"] = metric_result.get("reason")

    return flattened

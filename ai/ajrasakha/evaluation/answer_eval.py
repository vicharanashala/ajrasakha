from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval
from ajrasakha.evaluation.agri_correctness_metric import evaluate_agri_correctness


def evaluate_response_quality(result: dict, case: dict, enabled: bool = False) -> dict:
    """
    Run answer-quality scoring for a test case.

    When disabled (mock mode, or DeepEval/API keys unavailable), returns
    the same disabled shape as before so downstream code (CSV columns,
    dashboard ingestion) doesn't break.

    When enabled (live mode), runs:
      - DeepEval's AnswerRelevancyMetric / FaithfulnessMetric / ContextualRelevancyMetric
      - the custom AgriculturalCorrectnessMetric (crop / treatment / region)
    """
    if not enabled:
        return {
            "answer_quality_enabled": False,
            "answerrelevancymetric_score": "",
            "answerrelevancymetric_passed": "",
            "answerrelevancymetric_reason": "disabled",
            "faithfulnessmetric_score": "",
            "faithfulnessmetric_passed": "",
            "faithfulnessmetric_reason": "disabled",
            "contextualrelevancymetric_score": "",
            "contextualrelevancymetric_passed": "",
            "contextualrelevancymetric_reason": "disabled",
            "agri_correctness_required": False,
            "agri_correctness_score": "",
            "agri_correctness_pass": "",
            "agri_correctness_reason": "disabled",
            "agri_correctness_expected_crop": "",
            "agri_correctness_expected_treatment": "",
            "agri_correctness_expected_region": "",
        }

    query = result.get("query", "")
    answer = result.get("response_text", "")

    output = {"answer_quality_enabled": True}

    try:
        deepeval_results = evaluate_answer_with_deepeval(query=query, answer=answer)

        for metric_name, metric_result in deepeval_results.items():
            prefix = metric_name.lower()
            output[f"{prefix}_score"] = metric_result.get("score")
            output[f"{prefix}_passed"] = metric_result.get("passed")
            output[f"{prefix}_reason"] = metric_result.get("reason")

    except Exception as e:
        output["answerrelevancymetric_score"] = ""
        output["answerrelevancymetric_passed"] = False
        output["answerrelevancymetric_reason"] = f"deepeval_error: {e}"
        output["faithfulnessmetric_score"] = ""
        output["faithfulnessmetric_passed"] = False
        output["faithfulnessmetric_reason"] = f"deepeval_error: {e}"
        output["contextualrelevancymetric_score"] = ""
        output["contextualrelevancymetric_passed"] = False
        output["contextualrelevancymetric_reason"] = f"deepeval_error: {e}"

    agri_result = evaluate_agri_correctness(query=query, answer=answer, case=case)
    output.update(agri_result)

    return output

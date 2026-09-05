from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval
from ajrasakha.evaluation.agricultural_eval import evaluate_agricultural_domain_quality


def evaluate_response_quality(
    result: dict,
    case: dict | None = None,
    enabled: bool = False,
) -> dict:
    reference_answer = (case.get("expected_answer") if case else None) or result.get("reference_answer") or ""

    # Always evaluate agricultural domain dimensions (crop, region, treatment)
    agri_results = evaluate_agricultural_domain_quality(result, case, enabled=enabled)

    if not enabled:
        return {
            "answer_quality_enabled": False,
            "reference_answer": reference_answer or None,
            "answerrelevancymetric_score": "",
            "answerrelevancymetric_passed": "",
            "answerrelevancymetric_reason": "disabled",
            "faithfulnessmetric_score": "",
            "faithfulnessmetric_passed": "",
            "faithfulnessmetric_reason": "disabled",
            "contextualrelevancymetric_score": "",
            "contextualrelevancymetric_passed": "",
            "contextualrelevancymetric_reason": "disabled",
            "answercorrectness_score": "",
            "answercorrectness_passed": "",
            "answercorrectness_reason": "disabled",
            **agri_results,
        }

    query = result.get("query", "")
    answer = result.get("full_response_text", "")
    context = result.get("retrieved_context") or []

    try:
        eval_results = evaluate_answer_with_deepeval(
            query=query,
            answer=answer,
            context=context,
            expected_output=reference_answer if reference_answer else None,
        )

        relevance = eval_results.get("AnswerRelevancyMetric", {})
        faithfulness = eval_results.get("FaithfulnessMetric", {})
        context_relevance = eval_results.get("ContextualRelevancyMetric", {})
        correctness = eval_results.get("AnswerCorrectness") or eval_results.get("GEval", {})

        return {
            "answer_quality_enabled": True,
            "reference_answer": reference_answer or None,
            "answerrelevancymetric_score": relevance.get("score"),
            "answerrelevancymetric_passed": relevance.get("passed"),
            "answerrelevancymetric_reason": relevance.get("reason"),
            "faithfulnessmetric_score": faithfulness.get("score"),
            "faithfulnessmetric_passed": faithfulness.get("passed"),
            "faithfulnessmetric_reason": faithfulness.get("reason"),
            "contextualrelevancymetric_score": context_relevance.get("score"),
            "contextualrelevancymetric_passed": context_relevance.get("passed"),
            "contextualrelevancymetric_reason": context_relevance.get("reason"),
            "answercorrectness_score": correctness.get("score"),
            "answercorrectness_passed": correctness.get("passed"),
            "answercorrectness_reason": correctness.get("reason"),
            **agri_results,
            "quality_errors": agri_results.get("agricultural_evaluation_errors", []),
        }
    except Exception as exc:
        return {
            "answer_quality_enabled": True,
            "reference_answer": reference_answer or None,
            "answerrelevancymetric_score": None,
            "answerrelevancymetric_passed": False,
            "answerrelevancymetric_reason": f"Evaluation error: {exc}",
            "faithfulnessmetric_score": None,
            "faithfulnessmetric_passed": False,
            "faithfulnessmetric_reason": f"Evaluation error: {exc}",
            "contextualrelevancymetric_score": None,
            "contextualrelevancymetric_passed": False,
            "contextualrelevancymetric_reason": f"Evaluation error: {exc}",
            "answercorrectness_score": None,
            "answercorrectness_passed": False,
            "answercorrectness_reason": f"Evaluation error: {exc}",
            **agri_results,
            "quality_errors": [str(exc)] + agri_results.get("agricultural_evaluation_errors", []),
        }
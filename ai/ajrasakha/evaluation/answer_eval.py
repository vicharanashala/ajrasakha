from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval


def evaluate_response_quality(result: dict, enabled: bool = False) -> dict:
    if not enabled:
        return {
            "answer_quality_enabled": False,
            "answerrelevancymetric_score": "",
            "answerrelevancymetric_passed": "",
            "answerrelevancymetric_reason": "disabled",
            "faithfulnessmetric_score": "",
            "faithfulnessmetric_passed": "",
            "faithfulnessmetric_reason": "disabled",
        }

    query = result.get("query", "")
    answer = result.get("full_response_text", "")
    context = result.get("retrieved_context") or []

    try:
        eval_results = evaluate_answer_with_deepeval(query, answer, context)

        relevance = eval_results.get("AnswerRelevancyMetric", {})
        faithfulness = eval_results.get("FaithfulnessMetric", {})
        context_relevance = eval_results.get("ContextualRelevancyMetric", {})

        return {
            "answer_quality_enabled": True,
            "answerrelevancymetric_score": relevance.get("score"),
            "answerrelevancymetric_passed": relevance.get("passed"),
            "answerrelevancymetric_reason": relevance.get("reason"),
            "faithfulnessmetric_score": faithfulness.get("score"),
            "faithfulnessmetric_passed": faithfulness.get("passed"),
            "faithfulnessmetric_reason": faithfulness.get("reason"),
            "contextualrelevancymetric_score": context_relevance.get("score"),
            "contextualrelevancymetric_passed": context_relevance.get("passed"),
            "contextualrelevancymetric_reason": context_relevance.get("reason"),
            "quality_errors": [],
        }
    except Exception as exc:
        return {
            "answer_quality_enabled": True,
            "answerrelevancymetric_score": None,
            "answerrelevancymetric_passed": False,
            "answerrelevancymetric_reason": f"Evaluation error: {exc}",
            "faithfulnessmetric_score": None,
            "faithfulnessmetric_passed": False,
            "faithfulnessmetric_reason": f"Evaluation error: {exc}",
            "quality_errors": [str(exc)],
        }
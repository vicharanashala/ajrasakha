"""
Answer Quality Evaluation for AjraSakha Evaluation Pipeline (Project 3).

Wires the existing DeepEval scoring logic (deepeval_metrics.py) into the
pipeline. Previously this was a permanently disabled stub because it only
received `result`, never `case` - so it had no access to the actual query
text needed to score relevance/faithfulness.
"""

from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval


def evaluate_response_quality(result: dict, case: dict | None = None, enabled: bool = False) -> dict:
    """
    Evaluates answer quality using DeepEval metrics (AnswerRelevancy,
    Faithfulness, ContextualRelevancy).

    - enabled=False (mock mode): returns disabled placeholder, no API calls.
    - enabled=True (live mode): runs real DeepEval scoring against the judge model.
    """
    if not enabled:
        return {
            "answer_quality_enabled": False,
            "answer_quality_scores": {},
            "answer_quality_reason": "disabled",
        }

    query = (case.get("query") if case else None) or result.get("query", "")
    answer = str(result.get("response_text") or result.get("full_response_text") or "")
    context = (case.get("retrieved_context") if case else None) or result.get("retrieved_context") or []

    if not query or not answer.strip():
        return {
            "answer_quality_enabled": True,
            "answer_quality_scores": {},
            "answer_quality_reason": "missing_query_or_answer",
        }

    scores = evaluate_answer_with_deepeval(query=query, answer=answer, context=context)

    return {
        "answer_quality_enabled": True,
        "answer_quality_scores": scores,
        "answer_quality_reason": "scored",
    }

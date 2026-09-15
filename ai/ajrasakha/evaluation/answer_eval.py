"""
Answer Quality Evaluation for AjraSakha Evaluation Pipeline (Project 3).

Orchestrates all required quality metrics into one combined result:
- Answer Relevance, Faithfulness, Contextual Relevancy (via DeepEval,
  in deepeval_metrics.py)
- GDB Match Score (via DeepEval G-Eval, in deepeval_metrics.py)
- Agricultural correctness: crop, treatment, region (in
  agricultural_eval.py)

Previously evaluate_response_quality() was a permanently disabled stub
because it only received `result`, never `case` - so it had no access
to the query text, GDB reference answer, or expected crop/state needed
for real scoring.
"""

from ajrasakha.evaluation.deepeval_metrics import (
    evaluate_answer_with_deepeval,
    evaluate_gdb_match,
)
from ajrasakha.evaluation.agricultural_eval import evaluate_agricultural_domain_quality


def evaluate_response_quality(result: dict, case: dict | None = None, enabled: bool = False) -> dict:
    """
    Evaluates answer quality across all 4 required dimensions.

    - enabled=False (mock mode): returns disabled placeholder, no API calls.
    - enabled=True (live mode): runs real scoring against the judge model
      plus local agricultural heuristics (no API calls needed for the
      agricultural facets - those are rule-based, not LLM-judged).
    """
    if not enabled:
        return {
            "answer_quality_enabled": False,
            "answer_quality_scores": {},
            "answer_quality_reason": "disabled",
        }

    case = case or {}
    query = case.get("query") or result.get("query", "")
    answer = str(result.get("response_text") or result.get("full_response_text") or "")
    context = case.get("retrieved_context") or result.get("retrieved_context") or []
    expected_answer = case.get("expected_answer")
    expected_plan = case.get("expected_plan") or {}
    expected_crop = expected_plan.get("crop")
    location = case.get("location") or {}
    expected_state = location.get("state")
    expected_domain = case.get("expected_domain")

    if not query or not answer.strip():
        return {
            "answer_quality_enabled": True,
            "answer_quality_scores": {},
            "answer_quality_reason": "missing_query_or_answer",
        }

    deepeval_scores = evaluate_answer_with_deepeval(query=query, answer=answer, context=context)

    gdb_match_score = evaluate_gdb_match(
        query=query,
        answer=answer,
        expected_answer=expected_answer,
    )

    agricultural_scores = evaluate_agricultural_domain_quality(
        answer=answer,
        expected_crop=expected_crop,
        expected_state=expected_state,
        expected_domain=expected_domain,
    )

    combined_scores = {
        **deepeval_scores,
        "GDBMatchScore": gdb_match_score,
        **agricultural_scores,
    }

    return {
        "answer_quality_enabled": True,
        "answer_quality_scores": combined_scores,
        "answer_quality_reason": "scored",
    }

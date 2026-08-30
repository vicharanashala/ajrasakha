from typing import Optional, Dict, Any
from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval


def evaluate_response_quality(
    result: dict,
    case: Optional[dict] = None,
    enabled: bool = False,
    mock: bool = False,
) -> dict:
    """
    Evaluates generated response quality using DeepEval metrics:
    - Answer Relevance
    - Faithfulness (Context Grounding)
    - GDB Match Score (Golden alignment)
    - Agricultural Correctness & Safety (Custom domain metric)
    """
    case = case or {}
    query = case.get("query") or result.get("query") or ""
    answer = (
        result.get("response_text")
        or result.get("answer")
        or result.get("output")
        or ""
    )
    expected_output = case.get("expected_output") or ""
    context = case.get("retrieval_context") or []
    domain = case.get("domain") or case.get("expected_domain") or "General"

    if not enabled:
        return {
            "answer_quality_enabled": False,
            "quality_overall_score": "",
            "quality_overall_passed": "",
            "relevance_score": "",
            "relevance_passed": "",
            "relevance_reason": "disabled",
            "faithfulness_score": "",
            "faithfulness_passed": "",
            "faithfulness_reason": "disabled",
            "gdb_match_score": "",
            "gdb_match_passed": "",
            "gdb_match_reason": "disabled",
            "agri_correctness_score": "",
            "agri_correctness_passed": "",
            "agri_correctness_reason": "disabled",
        }

    eval_results = evaluate_answer_with_deepeval(
        query=query,
        answer=answer,
        expected_output=expected_output,
        context=context,
        domain=domain,
        mock=mock,
    )

    return {
        "answer_quality_enabled": True,
        "quality_overall_score": eval_results.get("overall_quality_score", 0.0),
        "quality_overall_passed": eval_results.get("overall_quality_passed", False),
        "relevance_score": eval_results.get("AnswerRelevancy", {}).get("score", 0.0),
        "relevance_passed": eval_results.get("AnswerRelevancy", {}).get("passed", False),
        "relevance_reason": eval_results.get("AnswerRelevancy", {}).get("reason", ""),
        "faithfulness_score": eval_results.get("Faithfulness", {}).get("score", 0.0),
        "faithfulness_passed": eval_results.get("Faithfulness", {}).get("passed", False),
        "faithfulness_reason": eval_results.get("Faithfulness", {}).get("reason", ""),
        "gdb_match_score": eval_results.get("GDBMatch", {}).get("score", 0.0),
        "gdb_match_passed": eval_results.get("GDBMatch", {}).get("passed", False),
        "gdb_match_reason": eval_results.get("GDBMatch", {}).get("reason", ""),
        "agri_correctness_score": eval_results.get("AgriculturalCorrectness", {}).get("score", 0.0),
        "agri_correctness_passed": eval_results.get("AgriculturalCorrectness", {}).get("passed", False),
        "agri_correctness_reason": eval_results.get("AgriculturalCorrectness", {}).get("reason", ""),
    }
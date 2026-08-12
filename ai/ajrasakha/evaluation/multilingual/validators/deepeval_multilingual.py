"""DeepEval opt-in multilingual evaluator (Step 012).

Enabled ONLY when:
  1. DEEPEVAL_MULTILINGUAL=1 environment variable is set
  2. At least one model credential is present (ANTHROPIC_API_KEY or OPENAI_API_KEY)

If either condition is missing, returns BLOCKED with a clear reason.
CI must never depend on this evaluator — it is always excluded from the mock suite.

Reuses evaluate_answer_with_deepeval() from the existing
ajrasakha.evaluation.deepeval_metrics without modification.
"""

from __future__ import annotations

import os


def is_deepeval_enabled() -> bool:
    """True only when both the opt-in flag AND model credentials are present."""
    if not os.getenv("DEEPEVAL_MULTILINGUAL", "").strip():
        return False
    has_anthropic = bool(os.getenv("ANTHROPIC_API_KEY", "").strip())
    has_openai = bool(os.getenv("OPENAI_API_KEY", "").strip())
    return has_anthropic or has_openai


def evaluate_deepeval(
    query: str,
    response_text: str,
    context: list[str] | None = None,
) -> dict:
    """Run DeepEval multilingual quality evaluation.

    Returns:
        deepeval_status       "PASS" | "FAIL" | "BLOCKED" | "SKIPPED"
        deepeval_answer_relevancy   float | None
        deepeval_faithfulness       float | None
        deepeval_reason       str
    """
    if not os.getenv("DEEPEVAL_MULTILINGUAL", "").strip():
        return {
            "deepeval_status": "SKIPPED",
            "deepeval_answer_relevancy": None,
            "deepeval_faithfulness": None,
            "deepeval_reason": "DEEPEVAL_MULTILINGUAL env var not set — skipped",
        }

    has_anthropic = bool(os.getenv("ANTHROPIC_API_KEY", "").strip())
    has_openai = bool(os.getenv("OPENAI_API_KEY", "").strip())
    if not (has_anthropic or has_openai):
        return {
            "deepeval_status": "BLOCKED",
            "deepeval_answer_relevancy": None,
            "deepeval_faithfulness": None,
            "deepeval_reason": (
                "BLOCKED: no model credentials found. "
                "Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable DeepEval."
            ),
        }

    if not response_text or not response_text.strip():
        return {
            "deepeval_status": "BLOCKED",
            "deepeval_answer_relevancy": None,
            "deepeval_faithfulness": None,
            "deepeval_reason": "BLOCKED: response_text is empty — cannot evaluate",
        }

    try:
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval
        results = evaluate_answer_with_deepeval(query, response_text, context or [])
    except Exception as exc:
        return {
            "deepeval_status": "ERROR",
            "deepeval_answer_relevancy": None,
            "deepeval_faithfulness": None,
            "deepeval_reason": f"DeepEval error: {exc!s}",
        }

    ar = results.get("AnswerRelevancyMetric", {})
    fm = results.get("FaithfulnessMetric", {})

    ar_score = ar.get("score")
    fm_score = fm.get("score")
    ar_passed = ar.get("passed", False)
    fm_passed = fm.get("passed", False)

    overall_pass = ar_passed and fm_passed
    reasons = []
    if not ar_passed:
        reasons.append(f"AnswerRelevancy={ar_score} ({ar.get('reason','')})")
    if not fm_passed:
        reasons.append(f"Faithfulness={fm_score} ({fm.get('reason','')})")

    return {
        "deepeval_status": "PASS" if overall_pass else "FAIL",
        "deepeval_answer_relevancy": float(ar_score) if ar_score is not None else None,
        "deepeval_faithfulness": float(fm_score) if fm_score is not None else None,
        "deepeval_reason": "; ".join(reasons) if reasons else "",
    }

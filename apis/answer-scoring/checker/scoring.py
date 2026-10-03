"""Turn a check result into a score: 1 mark for each check that passed.

Checks that don't apply, and checks that never ran, are left out of both
the score and the total.
"""

from __future__ import annotations

from typing import Any

from result_state import DEFERRED, ERROR, FAIL, NOT_APPLICABLE

# the 13 checks, in output order
CHECK_ORDER = (
    ("chemical", "banned_chemical"),
    ("chemical", "restricted_chemical"),
    ("chemical", "source_fidelity"),
    ("chemical", "uniformity_of_dose"),
    ("source", "source_present"),
    ("source", "page_number_present"),
    ("answer_quality", "answer_structure"),
    ("answer_quality", "sequence"),
    ("answer_quality", "query_properly_answered"),
    ("answer_quality", "contextuality"),
    ("terminology", "private_product_name"),
    ("terminology", "officer_name"),
    ("terminology", "local_name_mismatch"),
)

# these two aren't reliable yet, listed so the UI can show them as such
UNRELIABLE_CHECKS = frozenset({"source_fidelity", "local_name_mismatch"})


def score_answer(result: dict[str, Any]) -> dict[str, Any]:
    """Score one check result.

    out_of depends on the answer (a scheme question has no chemical checks),
    so use percentage to compare answers.

    - not_applicable: checks that don't apply, left out of score and out_of
    - not_evaluated: checks that should have run but got no verdict (model
      call failed), also left out; complete is False when there are any
    - percentage is None if nothing could be scored
    """
    parameters = result.get("parameters") or {}
    checks = []
    not_applicable = []
    not_evaluated = []
    score = 0
    out_of = 0
    for group, name in CHECK_ORDER:
        check = (parameters.get(group) or {}).get(name)
        if check is None:
            status, applicability, execution, detail = None, None, None, "Check did not run"
        else:
            status = check.get("status")
            applicability = check.get("applicability")
            execution = check.get("execution")
            detail = check.get("detail")
        if applicability == NOT_APPLICABLE:
            not_applicable.append(name)
            mark = None
        elif check is None or execution in (ERROR, DEFERRED):
            not_evaluated.append(name)
            mark = None
        else:
            mark = 0 if status == FAIL else 1
            score += mark
            out_of += 1
        checks.append({
            "group": group, "check": name, "status": status,
            "applicability": applicability, "execution": execution,
            "mark": mark, "detail": detail,
        })
    # review is needed on any failed check or any check that didn't run
    review_reasons = [
        f"{c['check']} FAILED: {c['detail']}" for c in checks if c["mark"] == 0
    ] + [
        f"{name}: no verdict available (model call failed after every retry)"
        for name in not_evaluated
    ]
    return {
        "score": score,
        "out_of": out_of,
        "percentage": round(100 * score / out_of, 1) if out_of else None,
        "complete": not not_evaluated,
        "checks": checks,
        "not_applicable": not_applicable,
        "not_evaluated": not_evaluated,
        "unreliable_checks_included": sorted(UNRELIABLE_CHECKS),
        "needs_human_review": bool(review_reasons),
        "review_reasons": review_reasons,
    }

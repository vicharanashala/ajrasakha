"""Turn a check_one() result into a 1-mark-per-check score out of 13.

Scoring rule (decided with the product owner 2026-09-29):
  - PASS               -> 1 mark
  - NOT_APPLICABLE     -> 1 mark (counts as a free mark, by decision)
  - no verdict at all  -> 1 mark, but listed separately as "not_evaluated"
                          so a flaky model call never silently costs the
                          author a mark
  - FAIL               -> 0 marks

This intentionally does not change how each check decides PASS/FAIL/NOT_
APPLICABLE -- it only reads what run_checker._check_one() already produced.
"""

from __future__ import annotations

from typing import Any

from result_state import DEFERRED, ERROR, FAIL, NOT_APPLICABLE

# The 13 checks in a fixed, stable order for API consumers.
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

# These checks are not yet reliable enough for their mark to mean anything:
# source_fidelity has never returned a real PASS/FAIL on a live answer, and
# local_name_mismatch's deterministic override is disabled in
# local_names.py because of a 67% false-flag rate at full scale.
# They still count (per the flat 1-mark-per-13 decision) but are called out
# here so a caller can choose to grey them out in a UI.
UNRELIABLE_CHECKS = frozenset({"source_fidelity", "local_name_mismatch"})


def score_answer(result: dict[str, Any]) -> dict[str, Any]:
    """Score one run_checker._check_one() result.

    Different question types have different applicable checks (a
    credit/scheme question never has a chemical to check, so
    banned_chemical etc. are NOT_APPLICABLE for it), so the count of
    applicable checks varies per answer. A raw "X out of 13" is therefore
    not comparable across answers -- 8/8 and 11/13 aren't the same thing.
    `out_of` here is the number of checks that actually applied to THIS
    answer, and `percentage` (score/out_of) is the number that's
    comparable across answers with different applicable-check counts.
    `score`/`out_of` are kept too, for anyone who wants the raw counts.

    A NOT_APPLICABLE check is excluded entirely -- it counts toward
    neither score nor out_of, so it can't inflate or deflate the
    percentage either way. A check with no verdict at all (a model call
    failed every retry) currently still gets a free mark and stays IN
    out_of, unlike NOT_APPLICABLE -- flagged in not_evaluated so this
    isn't hidden, but not yet excluded from the denominator; that's a
    separate decision from the applicability one this function encodes.

    Returns:
      {
        "score": int, "out_of": int (varies per answer -- see above),
        "percentage": float | None (None only if every check was
            NOT_APPLICABLE, so there was nothing to score),
        "checks": [{"group", "check", "status", "applicability", "execution", "mark", "detail"}, ...],
        "not_applicable": [check names excluded from score/out_of because
            they genuinely don't apply to this question type],
        "not_evaluated": [check names that DO apply but got no verdict
            because a model call or fetch failed after every retry --
            still awarded the mark and still counted in out_of for now;
            this IS a gap, unlike not_applicable],
        "unreliable_checks_included": [check names whose mark should not be
            read as a real verdict yet, regardless of applicability],
      }
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
        excluded = applicability == NOT_APPLICABLE
        if excluded:
            not_applicable.append(name)
            mark = None
        else:
            mark = 0 if status == FAIL else 1
            score += mark
            out_of += 1
            if check is None or execution in (ERROR, DEFERRED):
                not_evaluated.append(name)
        checks.append({
            "group": group, "check": name, "status": status,
            "applicability": applicability, "execution": execution,
            "mark": mark, "detail": detail,
        })
    # needs_human_review: true whenever the score is anything less than a
    # clean, fully-evaluated pass. This is deliberately broad -- per this
    # session's own testing, no single check here (not even the "solid"
    # ones) should be trusted to silently gate a decision, so a FAIL on
    # any applicable check, or a check with no verdict at all, routes to a
    # human rather than being absorbed into the score alone.
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
        "checks": checks,
        "not_applicable": not_applicable,
        "not_evaluated": not_evaluated,
        "unreliable_checks_included": sorted(UNRELIABLE_CHECKS),
        "needs_human_review": bool(review_reasons),
        "review_reasons": review_reasons,
    }

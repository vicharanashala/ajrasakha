"""Shared result-state helpers for individual quality-check results.

The legacy `status` field (PASS / FAIL / NOT_EVALUATED) is kept as-is so
every existing report and test keeps working unchanged. Layered on top of
it are two new, orthogonal fields that distinguish what NOT_EVALUATED used
to conflate:

- `applicability`: is this check even relevant to this answer at all.
  NOT_APPLICABLE is permanent given the current context (e.g. no source
  attached, so page number can't be judged) -- retrying it later without
  something about the answer itself changing will never produce a verdict.

- `execution`: did the check actually run to completion.
  SUCCEEDED means it ran (whether or not it turned out applicable).
  ERROR means a transient failure (e.g. the LLM call failed) -- this is
  exactly what a retry queue should pick back up, distinct from a check
  that plainly doesn't apply.
  DEFERRED means the check is applicable but the data needed to decide
  doesn't exist *yet* (e.g. dose uniformity with no comparable answer in
  the batch yet) -- worth re-attempting automatically as more data
  accumulates, without it being an error.

Every NOT_EVALUATED result should be built via `not_applicable_result`,
`deferred_result`, or `error_result` rather than calling `check_result`
directly with status=NOT_EVALUATED, so this distinction is never lost.
"""

from __future__ import annotations

from typing import Any


PASS = "PASS"
FAIL = "FAIL"
NOT_EVALUATED = "NOT_EVALUATED"
VALID_STATUSES = {PASS, FAIL, NOT_EVALUATED}

# Applicability: is this check relevant to this answer at all.
APPLICABLE = "APPLICABLE"
NOT_APPLICABLE = "NOT_APPLICABLE"
VALID_APPLICABILITY = {APPLICABLE, NOT_APPLICABLE}

# Execution: did the check actually run to completion.
SUCCEEDED = "SUCCEEDED"
ERROR = "ERROR"
DEFERRED = "DEFERRED"
VALID_EXECUTION = {SUCCEEDED, ERROR, DEFERRED}


def check_result(status: str, detail: str, **fields: Any) -> dict[str, Any]:
    """Build a PASS or FAIL result (or a NOT_EVALUATED one, for callers not
    yet migrated to the specific constructors below -- prefer those).
    """
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid check status: {status}")
    result: dict[str, Any] = {
        "status": status,
        # Retained for compatibility with existing report clients.
        "pass": True if status == PASS else False if status == FAIL else None,
        "detail": detail,
        "applicability": APPLICABLE,
        "execution": SUCCEEDED,
    }
    result.update(fields)
    return result


def not_applicable_result(detail: str, **fields: Any) -> dict[str, Any]:
    """This check will never apply here given the current context -- not
    worth retrying unless the answer's own content changes.
    """
    result = check_result(NOT_EVALUATED, detail, **fields)
    result["applicability"] = NOT_APPLICABLE
    result["execution"] = SUCCEEDED
    return result


def deferred_result(detail: str, **fields: Any) -> dict[str, Any]:
    """This check applies, but the data needed to decide doesn't exist yet
    (e.g. no comparable peer answer). Worth re-attempting automatically as
    more data accumulates -- not an error, not permanent.
    """
    result = check_result(NOT_EVALUATED, detail, **fields)
    result["applicability"] = APPLICABLE
    result["execution"] = DEFERRED
    return result


def error_result(detail: str, **fields: Any) -> dict[str, Any]:
    """The check applies and could be evaluated, but something transient
    broke (an API call failed, a fetch timed out). This is exactly what a
    retry queue should pick back up.
    """
    result = check_result(NOT_EVALUATED, detail, **fields)
    result["applicability"] = APPLICABLE
    result["execution"] = ERROR
    return result


def is_failed(result: dict[str, Any]) -> bool:
    return result.get("status") == FAIL


def needs_retry(result: dict[str, Any]) -> bool:
    """True for exactly the NOT_EVALUATED results worth automatically
    retrying (ERROR now, DEFERRED as new data may have arrived) -- false
    for NOT_APPLICABLE ones, which retrying can never resolve.
    """
    return result.get("execution") in {ERROR, DEFERRED}

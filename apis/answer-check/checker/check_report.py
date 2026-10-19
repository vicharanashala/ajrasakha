"""One check as the review page and the check API show it."""

from __future__ import annotations

from typing import Any


def _check_result(check: dict[str, Any] | None) -> str:
    if check is None:
        return "NOT_EVALUATED"
    if check.get("applicability") == "NOT_APPLICABLE":
        return "NOT_APPLICABLE"
    if check.get("execution") in ("ERROR", "DEFERRED"):
        return "NOT_EVALUATED"
    return "FAIL" if check.get("status") == "FAIL" else "PASS"


def check_entry(parameter: str, category: str, check: dict[str, Any] | None) -> dict[str, Any]:
    """One check as the review page stores it: the result, a reason a reviewer can act on,
    and the exact words to highlight in the answer."""
    check = check or {}
    result = _check_result(check or None)
    reason = str(check.get("detail") or "Check did not run")
    found = check.get("found")
    evidence = str(check.get("evidence") or "").strip()
    entry = {"parameter": parameter, "category": category, "result": result, "reason": reason}
    if result == "FAIL" and isinstance(found, str) and found:
        # name what was found and quote the sentence, instead of only "Banned chemical found"
        generic = "Banned chemical found"
        if reason.startswith(generic):
            # the page already says "Banned chemical", so do not repeat it
            reason = f"{found} {reason[len(generic):].strip()}".strip()
        else:
            reason = f"{found}: {reason}".rstrip()
        if not reason.endswith("."):
            reason += "."
        if evidence:
            reason += f" In the answer: “{evidence[:240]}{'...' if len(evidence) > 240 else ''}”"
        entry["reason"] = reason
    if result == "FAIL":
        words = check.get("matched_text") or (found if parameter in ("officer_name", "private_product_name") else None)
        if isinstance(words, str) and words.strip():
            entry["highlight"] = [words.strip()]
    return entry

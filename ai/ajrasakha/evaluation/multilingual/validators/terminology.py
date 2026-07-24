"""Terminology / transliteration validator (deterministic).

Checks that expected agri-domain terms appear in the response.
Terms are case-insensitive substring matches. This catches:
  - Missing crop names in responses
  - Missing key agricultural concepts (e.g. "urea", "nitrogen", "paddy")
  - Complete topic drift (response doesn't mention the subject at all)

For non-English responses: terms may appear in either English or in the
native script (we cannot enumerate all transliterations without human
validation). Therefore, the English term is checked as a substring;
if it's missing, we mark as WARN rather than FAIL — the response may
correctly use the native-script term, but we cannot verify without human
review.

Status mapping:
  - All terms found: terminology_pass = True
  - Any required term missing: terminology_pass = False
  - Non-English response with missing term: terminology_pass = False,
    terminology_review_required = True (flagged for human review)
"""

from __future__ import annotations

from ajrasakha.evaluation.multilingual.case_schema import MultilingualCase, TerminologyAssertion


def validate_terminology(
    response_text: str,
    case: MultilingualCase,
) -> dict:
    """Check that scenario-specific agri terms are present in the response.

    Returns:
        terminology_pass             bool
        terminology_reason           str  (empty on full pass)
        terminology_review_required  bool (True for non-English fails — needs human)
        terminology_missing_terms    list[str]
        terminology_found_terms      list[str]
    """
    text = str(response_text or "").lower()
    assertions = case.terminology_assertions

    if not assertions:
        # No terms to check — trivially pass
        return {
            "terminology_pass": True,
            "terminology_reason": "no terminology assertions defined",
            "terminology_review_required": False,
            "terminology_missing_terms": [],
            "terminology_found_terms": [],
        }

    missing: list[str] = []
    found: list[str] = []

    for assertion in assertions:
        term = assertion.term.lower()
        present = term in text

        if assertion.must_be_absent:
            if present:
                missing.append(f"BANNED:{assertion.term}")
            else:
                found.append(f"ABSENT-OK:{assertion.term}")
        else:
            if present:
                found.append(assertion.term)
            else:
                missing.append(assertion.term)

    passed = len(missing) == 0

    # Non-English responses may use native-script terms — flag for human review
    # rather than treating as a hard FAIL in live mode (in mock, fixture provides English)
    review_required = (not passed) and (case.expected_vocal != "English")

    reason = ""
    if missing:
        reason = "missing terms: " + ", ".join(missing[:10])
        if review_required:
            reason += (
                " [NOTE: response may use native-script equivalent — "
                "human review required before marking as FAIL]"
            )

    return {
        "terminology_pass": passed,
        "terminology_reason": reason,
        "terminology_review_required": review_required,
        "terminology_missing_terms": missing,
        "terminology_found_terms": found,
    }

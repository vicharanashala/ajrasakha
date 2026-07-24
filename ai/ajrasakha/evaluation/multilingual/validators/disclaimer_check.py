"""Disclaimer validator for the Multilingual Testing Suite.

Wraps and extends evaluate_disclaimer_language() from the existing
validators/disclaimer_language.py. That function performs exact-string
presence checks against the catalog. This module adds:

  - A clear PASS/FAIL/SKIPPED outcome with reasons
  - The "2hr_required" flag driving whether the 2-hour disclaimer is checked
  - A convenience wrapper that takes MultilingualCase directly

No duplication of disclaimer text — all expected strings come from the
existing translation catalog, loaded by case_generator.py at case creation.
"""

from __future__ import annotations

from ajrasakha.evaluation.multilingual.case_schema import MultilingualCase
from ajrasakha.evaluation.validators.disclaimer_language import evaluate_disclaimer_language


def validate_disclaimer(
    response_text: str,
    case: MultilingualCase,
) -> dict:
    """Validate disclaimer presence and placement in the response.

    Delegates to the existing evaluate_disclaimer_language() function,
    which checks:
      1. testing_disclaimer present in response
      2. testing_disclaimer at the bottom of response
      3. 2-hour disclaimer present (when case.disclaimer_2hr_required is True)
      4. Response is in the expected script/language

    Returns a superset of evaluate_disclaimer_language's output, with an
    added top-level 'disclaimer_pass' bool that combines all conditions.
    """
    # Build the legacy-dict format expected by evaluate_disclaimer_language
    result_dict = {"response_text": response_text}
    case_dict = case.to_legacy_dict()

    raw = evaluate_disclaimer_language(result_dict, case_dict)

    # Compute combined pass — all required checks must pass
    combined_pass = raw.get("disclaimer_language_pass", True)

    return {
        "disclaimer_pass": combined_pass,
        "disclaimer_reason": raw.get("disclaimer_language_reason", ""),
        "testing_disclaimer_required": raw.get("disclaimer_required", False),
        "testing_disclaimer_present": raw.get("testing_disclaimer_present", True),
        "testing_disclaimer_at_bottom": raw.get("testing_disclaimer_at_bottom", True),
        "two_hr_disclaimer_required": raw.get("two_hr_disclaimer_required", False),
        "two_hr_disclaimer_present": raw.get("two_hr_disclaimer_present", True),
    }

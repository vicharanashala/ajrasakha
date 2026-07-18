"""
agricultural_correctness — facet-decomposed correctness metric for PS3.

================================================================================
WHAT THIS IS
================================================================================
A custom (non-DeepEval) metric that decomposes "is the answer correct?" into
three independent facets, per the PS3 brief:

    Agricultural correctness:
      - Correct crop
      - Correct treatment
      - Correct regional applicability

The PS3 brief says "incorrect agricultural recommendations can cause real-
world harm" — which is why we want FACET-level visibility, not just an overall
similarity number. If the agent got the crop right but the treatment wrong,
that's a different failure mode than getting both right but the region wrong,
and a domain dashboard should distinguish them.

================================================================================
HOW IT WORKS
================================================================================
For each facet, the fixture declares an `expected_*` string in its metadata
bag (e.g. {"expected_crop": "tomato"}). The actual_output is checked for the
presence of that string (whole-word match, case-insensitive).

  crop score       = 1.0 if expected_crop (whole word, case-insensitive)
                     appears in actual_output, else 0.0
  treatment score  = 1.0 if expected_treatment (substring, case-insensitive)
                     appears in actual_output, else 0.0
  regional score   = 1.0 if expected_region (whole word, case-insensitive)
                     appears in actual_output, else 0.0

  overall score    = mean of the three facets (in [0.0, 1.0])

If a facet's expected_* field is missing from the fixture, that facet is
skipped and contributes 1.0 to the mean (we do not penalise for what we
cannot assess). This keeps backwards compatibility with existing fixtures
that don't declare expected_crop / expected_treatment / expected_region.

================================================================================
DESIGN DECISIONS
================================================================================
Why substring vs whole-word: crops and regions are typically single tokens
("tomato", "Karnataka") and whole-word match prevents false positives
("price" contains "rice"). Treatments are often multi-word chemical names
("Metalaxyl+Mancozeb", "neem-coated urea") so substring is more reliable.

Why not extract expected_* from the expected_output text itself: that's
implicit-annotation, error-prone (a treatment sentence that mentions an
incidental chemical would inflate the score). Explicit fixture fields
are auditable and let domain experts curate the expected values per case.

Why stdlib only: same rationale as gdb_match_score — no new heavy
dependency. The whole metric runs in <5ms per call.

================================================================================
API
================================================================================
    agricultural_correctness(actual_output: str, expected_output: str,
                             expected_crop: str = "",
                             expected_treatment: str = "",
                             expected_region: str = "") -> dict

    Returns: {
        "score": float,                  # mean of 3 facets in [0.0, 1.0]
        "method": str,                  # "facet_decomposition" (for log grep)
        "facets": {
            "crop": float,              # 0.0 / 1.0 (or 1.0 if expected_crop empty)
            "treatment": float,
            "regional": float,
        },
        "assessed_facets": [str, ...],  # names of facets that were actually checked
                                         # (i.e. the corresponding expected_* was non-empty)
    }
"""

from __future__ import annotations

import re


def agricultural_correctness(
    actual_output: str,
    expected_output: str,  # kept for API symmetry with gdb_match_score; not used directly
    expected_crop: str = "",
    expected_treatment: str = "",
    expected_region: str = "",
) -> dict:
    """
    Facet-decomposed agricultural correctness check.

    Parameters
    ----------
    actual_output : str
        The agent's response text. May be empty (returns 0.0 on all
        assessed facets).
    expected_output : str
        The canonical / ground-truth text. Accepted for API symmetry with
        gdb_match_score; this metric does NOT use it directly. Facet
        expectations come from the named parameters below.
    expected_crop : str
        Crop name expected in the answer. Empty = facet not assessed.
    expected_treatment : str
        Treatment terms expected in the answer. Empty = facet not assessed.
    expected_region : str
        Region/state expected in the answer. Empty = facet not assessed.

    Returns
    -------
    dict
        {"score": float, "method": str, "facets": {...}, "assessed_facets": [...]}
        as documented in the module docstring.

    Raises
    ------
    Never raises. Any unexpected input degrades to a 0.0 score on the
    affected facet (no exception propagation) so a faulty metric cannot
    crash a live eval run.
    """
    # Defensive type coercion — accept any input, treat None / non-str as empty
    def _safe(s) -> str:
        if s is None:
            return ""
        if not isinstance(s, str):
            return str(s)
        return s

    actual = _safe(actual_output)
    crop_term = _safe(expected_crop).strip()
    treatment_term = _safe(expected_treatment).strip()
    region_term = _safe(expected_region).strip()

    facets = {
        "crop":      _whole_word_match(crop_term, actual)      if crop_term      else 1.0,
        "treatment": _substring_match(treatment_term, actual)   if treatment_term else 1.0,
        "regional":  _whole_word_match(region_term, actual)    if region_term    else 1.0,
    }
    assessed = [name for name, term in (
        ("crop", crop_term),
        ("treatment", treatment_term),
        ("regional", region_term),
    ) if term]

    # Mean of ASSESSED facets only (unassessed facets contribute 1.0 by design)
    if assessed:
        score = sum(facets[n] for n in assessed) / len(assessed)
    else:
        # No facets declared — vacuous; we cannot assess correctness at all
        # Return 1.0 to be consistent with gdb_match_score's "vacuously
        # identical" semantics. Callers can check `assessed_facets == []` to
        # distinguish "all facets correct" from "no facets assessed".
        score = 1.0

    return {
        "score": round(float(score), 4),
        "method": "facet_decomposition",
        "facets": {k: round(float(v), 4) for k, v in facets.items()},
        "assessed_facets": assessed,
    }


# ---------------------------------------------------------------------------
# Matching primitives
# ---------------------------------------------------------------------------

def _whole_word_match(term: str, text: str) -> float:
    """
    1.0 if `term` appears in `text` as a whole word (case-insensitive),
    else 0.0. Whole-word = surrounded by non-alphanumeric characters or
    string boundary, so "rice" doesn't match "price".

    Empty term returns 0.0 (caller should not invoke with empty).
    """
    if not term or not text:
        return 0.0
    # \b at start/end anchors on word boundaries; re.IGNORECASE for case
    # insensitivity. Escape the term to handle regex metachars.
    pattern = r"\b" + re.escape(term) + r"\b"
    return 1.0 if re.search(pattern, text, flags=re.IGNORECASE) else 0.0


def _substring_match(term: str, text: str) -> float:
    """
    1.0 if `term` appears anywhere in `text` (case-insensitive), else 0.0.
    No word-boundary anchoring — multi-word chemical names like
    "Metalaxyl+Mancozeb" or "neem-coated urea" should match as a unit
    even when surrounded by punctuation or embedded in longer words.

    Empty term returns 0.0.
    """
    if not term or not text:
        return 0.0
    return 1.0 if term.lower() in text.lower() else 0.0

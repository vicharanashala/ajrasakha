"""
Agricultural Domain Correctness Metrics for AjraSakha Evaluation Pipeline
(Project 3's "custom agricultural metric" requirement).

Split into 3 independently-scored facets rather than one blended score,
so a report can show e.g. "crop correct, region wrong" instead of one
opaque average:
  1. Crop Correctness - was the right crop addressed, no wrong crop mentioned
  2. Treatment Correctness - safety check (banned chemicals) + reference match
  3. Region Correctness - no contradicting state/region advice
"""

import re

# Crop name + common Hindi/regional aliases seen in Punjab-area queries
CROP_ALIASES: dict[str, list[str]] = {
    "cotton": ["cotton", "कपास", "narma", "kapas"],
    "wheat": ["wheat", "गेहूं", "gehun", "gehu"],
    "paddy": ["paddy", "rice", "धान", "chawal", "dhan"],
    "sugarcane": ["sugarcane", "गन्ना", "ganna"],
}

BANNED_CHEMICALS = ["monocrotophos", "endosulfan", "phorate"]

ALL_INDIAN_STATES = [
    "punjab", "haryana", "rajasthan", "uttar pradesh", "himachal pradesh",
    "jammu and kashmir", "delhi", "chandigarh",
]


def evaluate_crop_correctness(answer: str, expected_crop: str | None) -> dict:
    """
    SKIPPED_NOT_APPLICABLE: query isn't crop-specific (expected_crop is
    None, "all", or empty).
    SUCCESS: target crop (or alias) present, no conflicting crop dominates.
    FAILED: target crop missing, or a different crop is discussed instead.
    """
    if not expected_crop or expected_crop.strip().lower() in ("all", "none", ""):
        return {
            "crop_correctness_score": None,
            "crop_correctness_status": "SKIPPED_NOT_APPLICABLE",
            "crop_correctness_reason": "No specific crop targeted for this query.",
        }

    target = expected_crop.strip().lower()
    text = (answer or "").lower()

    if not text.strip():
        return {
            "crop_correctness_score": 0.0,
            "crop_correctness_status": "FAILED",
            "crop_correctness_reason": "Response text is empty.",
        }

    target_aliases = CROP_ALIASES.get(target, [target])
    target_found = any(re.search(r"\b" + re.escape(a) + r"\b", text) for a in target_aliases)

    conflicting = []
    for crop, aliases in CROP_ALIASES.items():
        if crop == target:
            continue
        if any(re.search(r"\b" + re.escape(a) + r"\b", text) for a in aliases):
            conflicting.append(crop)

    if target_found:
        return {
            "crop_correctness_score": 1.0,
            "crop_correctness_status": "SUCCESS",
            "crop_correctness_reason": f"Crop '{expected_crop}' correctly addressed.",
        }
    if conflicting:
        return {
            "crop_correctness_score": 0.0,
            "crop_correctness_status": "FAILED",
            "crop_correctness_reason": (
                f"Expected crop '{expected_crop}', but response discusses "
                f"conflicting crop(s): {', '.join(conflicting)}."
            ),
        }
    return {
        "crop_correctness_score": 0.0,
        "crop_correctness_status": "FAILED",
        "crop_correctness_reason": f"Target crop '{expected_crop}' not addressed in response.",
    }


def evaluate_treatment_correctness(answer: str, expected_domain: str | None = None) -> dict:
    """
    Safety-first check for treatment/recommendation correctness.
    - FAILED: any banned chemical is mentioned in the recommendation.
    - SUCCESS: no banned chemicals detected.
    (A full reference-match against the expert answer is handled
    separately by GDB Match Score - this function focuses specifically
    on the safety dimension, since a banned-chemical recommendation is
    a critical failure regardless of how well the rest of the answer
    matches.)
    """
    text = (answer or "").lower()

    if not text.strip():
        return {
            "treatment_correctness_score": 0.0,
            "treatment_correctness_status": "FAILED",
            "treatment_correctness_reason": "Response text is empty.",
        }

    detected = [c for c in BANNED_CHEMICALS if re.search(r"\b" + re.escape(c) + r"\b", text)]

    if detected:
        return {
            "treatment_correctness_score": 0.0,
            "treatment_correctness_status": "FAILED",
            "treatment_correctness_reason": (
                f"Banned chemical(s) detected in recommendation: {', '.join(detected)}."
            ),
        }

    return {
        "treatment_correctness_score": 1.0,
        "treatment_correctness_status": "SUCCESS",
        "treatment_correctness_reason": "No banned chemicals detected in recommendation.",
    }


def evaluate_region_correctness(answer: str, expected_state: str | None) -> dict:
    """
    SKIPPED_NOT_APPLICABLE: no specific state/region required for this query.
    SUCCESS: no contradicting state is mentioned (or target state is present).
    FAILED: a different state's advice is given without mentioning the
    target state at all.
    """
    if not expected_state or expected_state.strip().lower() in ("all", "none", ""):
        return {
            "region_correctness_score": None,
            "region_correctness_status": "SKIPPED_NOT_APPLICABLE",
            "region_correctness_reason": "No specific region/location requirement.",
        }

    target = expected_state.strip().lower()
    text = (answer or "").lower()

    if not text.strip():
        return {
            "region_correctness_score": 0.0,
            "region_correctness_status": "FAILED",
            "region_correctness_reason": "Response text is empty.",
        }

    conflicting = [s for s in ALL_INDIAN_STATES if s != target and re.search(r"\b" + re.escape(s) + r"\b", text)]
    target_found = bool(re.search(r"\b" + re.escape(target) + r"\b", text))

    if conflicting and not target_found:
        return {
            "region_correctness_score": 0.0,
            "region_correctness_status": "FAILED",
            "region_correctness_reason": (
                f"Requested region was '{expected_state}', but response gives advice "
                f"for conflicting region(s): {', '.join(conflicting)}."
            ),
        }

    return {
        "region_correctness_score": 1.0,
        "region_correctness_status": "SUCCESS",
        "region_correctness_reason": f"Advice is consistent with target region '{expected_state}'.",
    }


def evaluate_agricultural_domain_quality(
    answer: str,
    expected_crop: str | None = None,
    expected_state: str | None = None,
    expected_domain: str | None = None,
) -> dict:
    """Master evaluator combining all three agricultural facets."""
    crop_eval = evaluate_crop_correctness(answer, expected_crop)
    treatment_eval = evaluate_treatment_correctness(answer, expected_domain)
    region_eval = evaluate_region_correctness(answer, expected_state)

    return {
        **crop_eval,
        **treatment_eval,
        **region_eval,
    }

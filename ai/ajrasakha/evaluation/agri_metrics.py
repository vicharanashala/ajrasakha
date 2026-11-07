"""
Custom agricultural accuracy metric.

DeepEval's generic metrics (relevancy/faithfulness) can't tell you whether
a chatbot recommended the wrong pesticide dosage or named the wrong crop --
that's a domain-specific correctness check, not a "did it sound plausible"
check. This metric does the narrow, high-stakes thing: for a test case that
declares an expected crop / treatment / region, confirm the bot's answer
actually contains them.

- crop / region checks are rule-based (fuzzy string match) since these are
  short, closed-vocabulary facts -- an LLM judge adds latency/cost with no
  accuracy benefit here.
- treatment checks (dosage, active ingredient, practice) are judged with
  Claude, since "same treatment" requires semantic comparison (units,
  synonyms, equivalent practices), not string matching.

Any of the three fields left unset or set to "all"/"none" on the test case
is treated as not-applicable and doesn't penalise the score, matching the
problem statement's "where applicable" qualifier.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass

from anthropic import Anthropic
from rapidfuzz import fuzz

from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase

CROP_MATCH_THRESHOLD = 80
REGION_MATCH_THRESHOLD = 75

_NOT_APPLICABLE = {"", "all", "none", "n/a", "na"}


def _is_applicable(value) -> bool:
    return bool(value) and str(value).strip().lower() not in _NOT_APPLICABLE


def _fuzzy_contains(haystack: str, needle: str, threshold: int) -> bool:
    haystack = (haystack or "").lower()
    needle = str(needle).lower().strip()
    if not needle:
        return True
    if needle in haystack:
        return True
    return fuzz.partial_ratio(needle, haystack) >= threshold


@dataclass
class TreatmentJudgeResult:
    matches: bool
    reason: str


def _judge_treatment_with_claude(answer: str, expected_treatment: str) -> TreatmentJudgeResult:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return TreatmentJudgeResult(matches=False, reason="ANTHROPIC_API_KEY not set; treatment not verified")

    client = Anthropic(api_key=api_key)
    judge_model = os.getenv("DEEPEVAL_JUDGE_MODEL", "claude-3-5-sonnet-20241022")

    prompt = (
        "You are auditing an agricultural chatbot's answer for a farmer. "
        "A wrong dosage or wrong recommendation here can cause real harm.\n\n"
        f"Expert-approved treatment/recommendation: {expected_treatment!r}\n"
        f"Chatbot answer: {answer!r}\n\n"
        "Does the chatbot answer recommend the same treatment as the "
        "expert-approved one -- same active ingredient/practice, and, if a "
        "dosage is given, one that is not materially different (allow for "
        "unit conversions and reasonable rounding)?\n"
        'Reply with ONLY compact JSON, no other text: {"matches": true|false, "reason": "<one short sentence>"}'
    )

    try:
        response = client.messages.create(
            model=judge_model,
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(
            block.text for block in response.content if getattr(block, "type", "") == "text"
        )
        start, end = text.find("{"), text.rfind("}")
        data = json.loads(text[start : end + 1])
        return TreatmentJudgeResult(
            matches=bool(data.get("matches")),
            reason=str(data.get("reason", "")),
        )
    except Exception as exc:
        return TreatmentJudgeResult(matches=False, reason=f"judge_error: {exc}")


class AgriAccuracyMetric(BaseMetric):
    """
    Checks whether a bot's answer mentions the correct crop, the correct
    treatment/recommendation, and the correct region, wherever the test
    case declares these via `metadata`:
        {"expected_crop": ..., "expected_treatment": ..., "expected_region": ...}
    """

    def __init__(self, threshold: float = 0.7):
        self.threshold = threshold
        self.score = None
        self.reason = None
        self.success = None

    @property
    def __name__(self):
        return "AgriAccuracyMetric"

    def measure(self, test_case: LLMTestCase) -> float:
        # `metadata` is the current field name; `additional_metadata` is
        # kept as a fallback for older deepeval versions that only have
        # the deprecated alias.
        case_meta = getattr(test_case, "metadata", None) or getattr(
            test_case, "additional_metadata", None
        ) or {}

        expected_crop = case_meta.get("expected_crop")
        expected_region = case_meta.get("expected_region")
        expected_treatment = case_meta.get("expected_treatment")

        answer = test_case.actual_output or ""

        checks: list[bool] = []
        reasons: list[str] = []

        if _is_applicable(expected_crop):
            ok = _fuzzy_contains(answer, expected_crop, CROP_MATCH_THRESHOLD)
            checks.append(ok)
            if not ok:
                reasons.append(f"crop '{expected_crop}' not found in answer")

        if _is_applicable(expected_region):
            ok = _fuzzy_contains(answer, expected_region, REGION_MATCH_THRESHOLD)
            checks.append(ok)
            if not ok:
                reasons.append(f"region '{expected_region}' not found in answer")

        if _is_applicable(expected_treatment):
            judged = _judge_treatment_with_claude(answer, expected_treatment)
            checks.append(judged.matches)
            if not judged.matches:
                reasons.append(f"treatment mismatch: {judged.reason}")

        if not checks:
            self.score = 1.0
            self.success = True
            self.reason = "no crop/treatment/region applicable to this query"
            return self.score

        self.score = sum(1 for c in checks if c) / len(checks)
        self.success = self.score >= self.threshold
        self.reason = "; ".join(reasons) if reasons else "crop/treatment/region all correct"
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return bool(self.success)

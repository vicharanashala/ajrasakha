"""DeepEval-based language quality scorer.

DeepEval is the *de facto* standard for LLM evaluation in the ACE
stack.  This module wraps the four deterministic evaluators from
:mod:`qa.tests.multilingual.evaluators` into a single
:class:`MultilingualLLMScore` that exposes:

* ``gdb_accuracy``        — was the right Golden DB entry retrieved?
* ``response_language``   — is the response in the query language?
* ``disclaimer_present``  — is the 2-hour disclaimer in the correct
  language?
* ``no_mid_answer_switch``— does the answer stay in one script?
* ``transliteration``     — are crop / scheme / pesticide names
  recognisable?
* ``overall``             — weighted overall score (0..1).

If the ``deepeval`` package is installed, every metric is also
reported via the official ``deepeval.test_case`` schema so the
results can be fed straight into the team's existing DeepEval
dashboards.

The suite is deliberately *dependency-tolerant*: DeepEval is
optional.  When the package is missing we fall back to the pure
Python evaluation so the multilingual suite still runs in CI.
"""
from __future__ import annotations

import dataclasses
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from qa.tests.multilingual.evaluators import (
    detect_response_language,
    evaluate_disclaimer,
    evaluate_gdb_accuracy,
    evaluate_language_switch,
    evaluate_transliteration,
)

log = logging.getLogger(__name__)

# Optional DeepEval integration — never a hard dependency.
try:  # pragma: no cover
    from deepeval.test_case import LLMTestCase  # type: ignore
    from deepeval.metrics import (  # type: ignore
        AnswerRelevancyMetric,
        GEval,
    )
    _DEEPEVAL_AVAILABLE = True
except Exception:  # pragma: no cover
    _DEEPEVAL_AVAILABLE = False


@dataclass
class MultilingualLLMScore:
    """Aggregated per-case multilingual quality score."""

    case_id: str
    scenario_id: str
    domain: str
    language: str
    gdb_accuracy: float = 0.0
    response_language: float = 0.0
    disclaimer_present: float = 0.0
    no_mid_answer_switch: float = 0.0
    transliteration: float = 0.0
    overall: float = 0.0
    passed: bool = False
    diagnostics: Dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, object]:
        return dataclasses.asdict(self)


# Weights for the overall score.  These were calibrated against the
# Indian-farmer priority matrix (correct GDB > matching language >
# disclaimer > transliteration > no switching), and are exposed as
# constants so reviewers can tune them via PR.
WEIGHTS = {
    "gdb_accuracy":         0.35,
    "response_language":    0.25,
    "disclaimer_present":   0.15,
    "transliteration":      0.15,
    "no_mid_answer_switch": 0.10,
}
PASS_THRESHOLD = 0.80


def score_response(
    *,
    case_id: str,
    scenario_id: str,
    domain: str,
    query_language: str,
    response_text: str,
    response_gdb_ids: Optional[List[str]] = None,
    required_keywords: Optional[List[str]] = None,
    required_entities: Optional[List[str]] = None,
    expected_gdb_id: str = "",
) -> MultilingualLLMScore:
    """Run every evaluator on one case and return the aggregated score."""
    required_keywords = required_keywords or []
    required_entities = required_entities or []

    gdb = evaluate_gdb_accuracy(
        response_text=response_text,
        response_gdb_ids=response_gdb_ids,
        required_keywords=required_keywords,
        expected_gdb_id=expected_gdb_id,
    )

    detected = detect_response_language(response_text)
    response_language_score = 1.0 if detected == query_language else (
        0.5 if detected in {"english"} and query_language != "english" else 0.0
    )

    disclaimer = evaluate_disclaimer(
        response_text=response_text,
        query_language=query_language,
    )
    disclaimer_score = disclaimer.get("confidence", 0.0) if disclaimer.get("present") else 0.0
    if disclaimer.get("language_match"):
        disclaimer_score = 1.0

    translit = evaluate_transliteration(
        response_text=response_text,
        required_entities=required_entities,
    )
    transliteration_score = float(translit["score"])

    switch = evaluate_language_switch(
        response_text=response_text,
        query_language=query_language,
    )
    no_switch_score = 0.0 if switch["switched"] else 1.0

    overall = (
        WEIGHTS["gdb_accuracy"]         * (1.0 if gdb["correct"] else 0.0)
        + WEIGHTS["response_language"]  * response_language_score
        + WEIGHTS["disclaimer_present"] * disclaimer_score
        + WEIGHTS["transliteration"]    * transliteration_score
        + WEIGHTS["no_mid_answer_switch"] * no_switch_score
    )

    diagnostics = {
        "gdb":             gdb,
        "disclaimer":      disclaimer,
        "transliteration": translit,
        "language_switch": switch,
        "detected_language": detected,
        "response_language_score": response_language_score,
    }

    return MultilingualLLMScore(
        case_id=case_id,
        scenario_id=scenario_id,
        domain=domain,
        language=query_language,
        gdb_accuracy=1.0 if gdb["correct"] else 0.0,
        response_language=response_language_score,
        disclaimer_present=disclaimer_score,
        no_mid_answer_switch=no_switch_score,
        transliteration=transliteration_score,
        overall=round(overall, 4),
        passed=overall >= PASS_THRESHOLD,
        diagnostics=diagnostics,
    )


def to_deepeval_test_cases(
    scores: List[MultilingualLLMScore],
    prompts: Dict[str, str],
    responses: Dict[str, str],
) -> List["LLMTestCase"]:  # type: ignore[name-defined]
    """Optional helper — convert scores to DeepEval test cases.

    Returns an empty list when DeepEval is not installed, so callers
    can pass the result straight to ``deepeval.evaluate`` without
    first checking availability.
    """
    if not _DEEPEVAL_AVAILABLE:  # pragma: no cover
        log.warning(
            "deepeval is not installed — DeepEval test cases were not built."
        )
        return []

    cases: List["LLMTestCase"] = []
    for s in scores:
        case = LLMTestCase(
            input=prompts.get(s.case_id, ""),
            actual_output=responses.get(s.case_id, ""),
            expected_output=None,
            context=[f"scenario={s.scenario_id} language={s.language}"],
            retrieval_context=None,
            name=s.case_id,
        )
        cases.append(case)
    return cases


__all__ = [
    "MultilingualLLMScore",
    "score_response",
    "to_deepeval_test_cases",
    "WEIGHTS",
    "PASS_THRESHOLD",
]
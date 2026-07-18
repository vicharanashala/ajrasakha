"""
evaluate_response_quality — answer quality evaluation via DeepEval.

====================================================================
Metric activation matrix (PR1+PR3+PR3-Phase1):

| Metric                          | retrieval_context provided?   | Runs?             | Notes |
|---------------------------------|--------------------------------|-------------------|-------|
| AnswerRelevancyMetric           | always                         | YES               | needs only input+output |
| FaithfulnessMetric              | non-empty list                 | YES (auto-activates) | circular vs GDB Q&A (see GDB_STRUCTURE.md §6) |
| ContextualRelevancyMetric       | non-empty list                 | YES (auto-activates) | valid vs GDB Q&A |
| gdb_match_score (custom)        | always (independent of ctx)    | YES when expected_output present | output-vs-expected text overlap |
| agricultural_correctness (custom)| always (independent of ctx)    | YES when expected_output present | facet-decomposed: crop + treatment + regional |

Return keys — identical across all four states (disabled / skipped / answer_missing / scored):

  answer_quality_enabled
  answerrelevancymetric_score / _passed / _reason
  faithfulnessmetric_score / _passed / _reason
  contextualrelevancymetric_score / _passed / _reason
  gdb_match_score_score / _method                                            # custom (non-DeepEval) signal
  agriculturalcorrectness_score / _facets_crop / _facets_treatment
                              / _facets_regional / _facets_assessed         # custom facet-decomposed correctness
====================================================================
"""

from ajrasakha.evaluation.judge import get_judge
from ajrasakha.evaluation.gdb_match_score import gdb_match_score
from ajrasakha.evaluation.agricultural_correctness import agricultural_correctness


def evaluate_response_quality(result: dict, enabled: bool = False) -> dict:
    """
    Evaluate agent response quality using DeepEval metrics + custom signals.

    Called by run.py: run_case() -> evaluate_response_quality(result, enabled=...)

    result fields consumed (from executors.py run_mock_case / run_live_case):
      result["query"]               — user question  (LLMTestCase.input)
      result["response_text"]       — agent answer   (LLMTestCase.actual_output)
      result.get("context")         — retrieved docs (LLMTestCase.retrieval_context)
                                       NOTE: currently always [] — see module docstring
      result.get("expected_output") — canonical answer (LLMTestCase.expected_output)
                                       NOTE: only present for ground-truth fixture runs;
                                       live agent runs omit it and gdb_match_score +
                                       agricultural_correctness return method="not_applicable".
      result.get("expected_metadata") or result.get("expected_*")
                                     — optional dict (or top-level fields) declaring
                                       expected_crop / expected_treatment / expected_region
                                       for the agricultural_correctness facets.

    enabled == False  → stub response, all keys present, values = "", "disabled"
    enabled == True   → real evaluation; Faithfulness/ContextualRelevancy
                        SKIPPED when retrieval_context is empty; gdb_match_score
                        + agricultural_correctness computed independently whenever
                        expected_output is present.
    """

    query = result.get("query", "")
    answer = result.get("response_text", "")
    retrieval_context = result.get("context") or []

    # ------------------------------------------------------------------
    # Guard: empty query or answer (matches deepeval_metrics.py behavior)
    # ------------------------------------------------------------------
    if not query or not str(query).strip() or not answer or not str(answer).strip():
        return _quality_dict(
            answerrelevancy={"score": "", "passed": "", "reason": "answer_missing"},
            faithfulness={"score": "", "passed": "", "reason": "answer_missing"},
            contextual_relevancy={"score": "", "passed": "", "reason": "answer_missing"},
            gdb_match={"score": "", "method": "not_applicable", "reason": "answer_missing"},
            agricultural_correctness=_empty_agricultural_correctness("answer_missing"),
            enabled=True,
        )

    # ------------------------------------------------------------------
    # Stub — preserve return shape so CSV column positions never shift
    # ------------------------------------------------------------------
    if not enabled:
        return _quality_dict(
            answerrelevancy={"score": "", "passed": "", "reason": "disabled"},
            faithfulness={"score": "", "passed": "", "reason": "disabled"},
            contextual_relevancy={"score": "", "passed": "", "reason": "disabled"},
            gdb_match={"score": "", "method": "not_applicable", "reason": "disabled"},
            agricultural_correctness=_empty_agricultural_correctness("disabled"),
            enabled=False,
        )

    # ------------------------------------------------------------------
    # Judge (mock / ollama / anthropic) — resolved once, shared
    # ------------------------------------------------------------------
    judge = get_judge()

    # ------------------------------------------------------------------
    # Metric definitions — all three always defined so column keys are
    # identical whether skipped or scored.
    # requires_context=True means: skip if retrieval_context is empty.
    # AnswerRelevancy always runs (needs only input + actual_output).
    # ------------------------------------------------------------------
    from deepeval.metrics import (
        AnswerRelevancyMetric,
        FaithfulnessMetric,
        ContextualRelevancyMetric,
    )
    from deepeval.test_case import LLMTestCase

    METRICS = [
        ("answerrelevancymetric",    AnswerRelevancyMetric,    False),  # always runs — needs only input+output
        ("faithfulnessmetric",        FaithfulnessMetric,       True),   # only if retrieval_context non-empty
        ("contextualrelevancymetric", ContextualRelevancyMetric, True),  # only if retrieval_context non-empty
    ]

    test_case = LLMTestCase(
        input=query,
        actual_output=answer,
        retrieval_context=retrieval_context,
    )

    # ------------------------------------------------------------------
    # Evaluate each DeepEval metric, skipping Faithfulness+Contextual when
    # no retrieval_context is available
    # ------------------------------------------------------------------
    results = {}

    for metric_key, metric_cls, requires_context in METRICS:
        skip_reason = (
            "pending: retrieval_context not exposed by AI service — "
            "tracked as follow-up"
        )

        if requires_context and not retrieval_context:
            # Honest SKIP — do not run against empty context
            results[metric_key] = {"score": "", "passed": "SKIPPED", "reason": skip_reason}
            continue

        try:
            metric = metric_cls(threshold=0.5, model=judge, async_mode=False)
            metric.measure(test_case, _show_indicator=False)
            # CORRECT attribute names (confirmed from installed deepeval v4.0.7):
            #   metric.score   -> float
            #   metric.success -> bool   (NOT metric.passed)
            #   metric.reason  -> str
            raw_score = metric.score
            passed = metric.success
            reason = metric.reason or ""
        except Exception as exc:
            raw_score = None
            passed = False
            reason = f"Exception: {exc}"

        score_str = str(round(raw_score, 4)) if raw_score is not None else ""
        passed_str = "PASS" if passed else "FAIL"

        results[metric_key] = {
            "score": score_str,
            "passed": passed_str,
            "reason": reason,
        }

    return _quality_dict(
        answerrelevancy=results["answerrelevancymetric"],
        faithfulness=results["faithfulnessmetric"],
        contextual_relevancy=results["contextualrelevancymetric"],
        gdb_match=_compute_gdb_match_score(result),
        agricultural_correctness=_compute_agricultural_correctness(result),
        enabled=True,
    )


# ===========================================================================
# Internal — gdb_match_score integration
# ===========================================================================

def _compute_gdb_match_score(result: dict) -> dict:
    """
    Compute gdb_match_score when expected_output is available.

    Does NOT need retrieval_context — it's a direct output-vs-expected
    comparison, complementary to AnswerRelevancy (judgment-based).

    Live agent runs (which lack expected_output) return method="not_applicable"
    so the column is present but empty — preserves the
    "identical keys in all states" invariant.
    """
    expected_output = result.get("expected_output")
    actual_output = result.get("response_text", "")

    # No expected_output → not applicable (live runs, fixture-less runs).
    # Per directive: do NOT guess or default.
    if not expected_output or not str(expected_output).strip():
        return {"score": "", "method": "not_applicable", "reason": "no_expected_output"}

    try:
        match = gdb_match_score(actual_output, expected_output)
        return {
            "score":  match["score"],
            "method": match["method"],
            "reason": "evaluated",
        }
    except Exception as exc:
        return {"score": "", "method": "seqmatch", "reason": f"Exception: {exc}"}


# ===========================================================================
# Internal — agricultural_correctness integration
# ===========================================================================

def _empty_agricultural_correctness(reason: str) -> dict:
    """Build an empty agricultural_correctness dict for the disabled/answer_missing states."""
    return {
        "score": "",
        "facets_crop": "",
        "facets_treatment": "",
        "facets_regional": "",
        "facets_assessed": "",
        "method": "not_applicable",
        "reason": reason,
    }


def _compute_agricultural_correctness(result: dict) -> dict:
    """
    Compute agricultural_correctness when expected_output is available.

    Reads expected_crop / expected_treatment / expected_region from
    result["expected_metadata"] (a dict) — the same dict that gets
    surfaced through the run_ground_truth runner from fixture metadata.
    Falls back to looking at top-level expected_* fields if
    expected_metadata is absent.

    Mirrors the gdb_match_score integration pattern: returns
    method="not_applicable" when expected_output is missing, so the
    column is present but empty across all states.

    Returns
    -------
    dict
        All six fields required by _quality_dict's agricultural_correctness
        contract:
          score             — float (mean of assessed facets) or ""
          facets_crop       — float 0/1 or ""
          facets_treatment  — float 0/1 or ""
          facets_regional   — float 0/1 or ""
          facets_assessed   — comma-separated facet names (CSV-safe) or ""
          method            — "facet_decomposition" | "not_applicable"
          reason            — "evaluated" | "no_expected_output" | exception text
    """
    expected_output = result.get("expected_output")
    actual_output = result.get("response_text", "")

    # No expected_output → not applicable (live runs, fixture-less runs).
    # Same gating as gdb_match_score; both depend on ground truth being
    # available, so both stay aligned.
    if not expected_output or not str(expected_output).strip():
        return _empty_agricultural_correctness("no_expected_output")

    # Fixture metadata: prefer result["expected_metadata"] if present,
    # else look at top-level expected_* keys on the result dict itself
    # (covers the case where a caller populates them inline).
    meta = result.get("expected_metadata") or {}
    if not isinstance(meta, dict):
        meta = {}

    expected_crop = str(
        meta.get("expected_crop")
        or result.get("expected_crop")
        or ""
    )
    expected_treatment = str(
        meta.get("expected_treatment")
        or result.get("expected_treatment")
        or ""
    )
    expected_region = str(
        meta.get("expected_region")
        or result.get("expected_region")
        or ""
    )

    try:
        match = agricultural_correctness(
            actual_output,
            expected_output,
            expected_crop=expected_crop,
            expected_treatment=expected_treatment,
            expected_region=expected_region,
        )
        # facets dict values come back as floats; the assessed_facets
        # list is list[str]. Convert facets to strings for CSV column
        # stability (matches the gdb_match_score pattern: score_str =
        # str(round(...))). The assessed_facets list is also converted
        # to a comma-separated string since lists aren't CSV-safe.
        assessed_str = ",".join(match.get("assessed_facets", []))
        return {
            "score":             _fmt(match["score"]),
            "facets_crop":       _fmt(match["facets"]["crop"]),
            "facets_treatment":  _fmt(match["facets"]["treatment"]),
            "facets_regional":   _fmt(match["facets"]["regional"]),
            "facets_assessed":   assessed_str,
            "method":            match["method"],
            "reason":            "evaluated",
        }
    except Exception as exc:
        return {
            "score":             "",
            "facets_crop":       "",
            "facets_treatment":  "",
            "facets_regional":   "",
            "facets_assessed":   "",
            "method":            "facet_decomposition",
            "reason":            f"Exception: {exc}",
        }


def _fmt(value) -> str:
    """
    Format a numeric value as a string for CSV-stable columns.

    Mirrors the gdb_match_score_score convention: float -> "1.0" (4 dp),
    None -> "". Used in _compute_agricultural_correctness for every
    numeric field so the in-memory result dict is CSV-ready without
    the storage layer needing to re-cast.
    """
    if value is None or value == "":
        return ""
    try:
        return str(round(float(value), 4))
    except (TypeError, ValueError):
        return ""


# ===========================================================================
# Internal — return-dict assembly
# ===========================================================================

def _quality_dict(
    answerrelevancy: dict,
    faithfulness: dict,
    contextual_relevancy: dict,
    gdb_match: dict,
    agricultural_correctness: dict,
    enabled: bool = True,
) -> dict:
    """
    Assemble the flat return dict with identical keys in all states.
    Ensures CSV column order is stable regardless of how metrics resolved.
    """
    return {
        "answer_quality_enabled": enabled,
        # AnswerRelevancyMetric
        "answerrelevancymetric_score":    answerrelevancy["score"],
        "answerrelevancymetric_passed":   answerrelevancy["passed"],
        "answerrelevancymetric_reason":   answerrelevancy["reason"],
        # FaithfulnessMetric
        "faithfulnessmetric_score":       faithfulness["score"],
        "faithfulnessmetric_passed":      faithfulness["passed"],
        "faithfulnessmetric_reason":      faithfulness["reason"],
        # ContextualRelevancyMetric
        "contextualrelevancymetric_score":  contextual_relevancy["score"],
        "contextualrelevancymetric_passed": contextual_relevancy["passed"],
        "contextualrelevancymetric_reason": contextual_relevancy["reason"],
        # gdb_match_score (custom, non-DeepEval)
        "gdb_match_score_score":  gdb_match["score"],
        "gdb_match_score_method": gdb_match["method"],
        # agricultural_correctness (custom, facet-decomposed)
        "agriculturalcorrectness_score":          agricultural_correctness["score"],
        "agriculturalcorrectness_facets_crop":   agricultural_correctness["facets_crop"],
        "agriculturalcorrectness_facets_treatment": agricultural_correctness["facets_treatment"],
        "agriculturalcorrectness_facets_regional": agricultural_correctness["facets_regional"],
        "agriculturalcorrectness_facets_assessed": agricultural_correctness["facets_assessed"],
    }
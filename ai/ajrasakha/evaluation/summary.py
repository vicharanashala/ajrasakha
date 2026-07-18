def _parse_score(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build_summary(results: list[dict]) -> dict:
    total = len(results)

    technical_passed = sum(1 for r in results if r.get("technical_pass") is True)
    routing_passed   = sum(1 for r in results if r.get("routing_pass") is True)
    tool_passed      = sum(1 for r in results if r.get("tool_pass") is True)

    failed = total - technical_passed

    # ── Answer Relevancy ──────────────────────────────────────────────────
    ran = [r for r in results if r.get("answerrelevancymetric_passed") in ("PASS", "FAIL")]
    answer_relevancy_evaluated = len(ran)
    answer_relevancy_passed    = sum(1 for r in ran if r.get("answerrelevancymetric_passed") == "PASS")

    scores = [_parse_score(r.get("answerrelevancymetric_score")) for r in ran]
    valid_scores = [s for s in scores if s is not None]
    answer_relevancy_mean_score = (
        round(sum(valid_scores) / len(valid_scores), 4) if valid_scores else None
    )

    # ── Faithfulness + ContextualRelevancy skip counts ───────────────────
    faithfulness_skipped         = sum(1 for r in results if r.get("faithfulnessmetric_passed") == "SKIPPED")
    contextual_relevancy_skipped = sum(1 for r in results if r.get("contextualrelevancymetric_passed") == "SKIPPED")

    # ── gdb_match_score (custom, non-DeepEval) ──────────────────────────
    # Only count as "evaluated" when method is set (i.e., expected_output
    # was present). Cases where method="not_applicable" (live runs without
    # ground truth) are NOT counted — they are not part of the eval population.
    gdb_match_ran = [
        r for r in results
        if r.get("gdb_match_score_method") not in (None, "", "not_applicable")
    ]
    gdb_match_score_evaluated = len(gdb_match_ran)
    gdb_match_scores = [_parse_score(r.get("gdb_match_score_score")) for r in gdb_match_ran]
    gdb_match_valid_scores = [s for s in gdb_match_scores if s is not None]
    gdb_match_score_mean_score = (
        round(sum(gdb_match_valid_scores) / len(gdb_match_valid_scores), 4)
        if gdb_match_valid_scores
        else None
    )

    # ── agricultural_correctness (custom, facet-decomposed) ────────────
    # Same gating as gdb_match_score: only count cases where the metric
    # actually ran (method != "not_applicable"). Cases where expected_*
    # fields were absent leave the metric in not_applicable state.
    # We additionally surface the FACET-level pass rates — that's the
    # unique value of this metric. Per-domain slicing is done by the
    # domain_report layer (run_ground_truth.py --domain-report); here
    # we just give the population-level facet pass rates.
    agri_ran = [
        r for r in results
        if r.get("agriculturalcorrectness_facets_assessed") not in (None, "", "not_applicable")
    ]
    agricultural_correctness_evaluated = len(agri_ran)

    # Overall score mean
    agri_scores = [_parse_score(r.get("agriculturalcorrectness_score")) for r in agri_ran]
    agri_valid_scores = [s for s in agri_scores if s is not None]
    agricultural_correctness_mean_score = (
        round(sum(agri_valid_scores) / len(agri_valid_scores), 4)
        if agri_valid_scores
        else None
    )

    # Per-facet pass rates (count of 1.0 / count of assessed for that facet)
    def _facet_pass_rate(facet_key: str) -> tuple[int, int, float | None]:
        passed = 0
        assessed_count = 0
        for r in agri_ran:
            assessed_str = r.get("agriculturalcorrectness_facets_assessed") or ""
            if facet_key not in assessed_str.split(","):
                continue
            assessed_count += 1
            score = _parse_score(r.get(f"agriculturalcorrectness_facets_{facet_key}"))
            if score is not None and score >= 1.0:
                passed += 1
        rate = round(passed / assessed_count, 4) if assessed_count else None
        return passed, assessed_count, rate

    crop_passed, crop_assessed, crop_pass_rate = _facet_pass_rate("crop")
    treatment_passed, treatment_assessed, treatment_pass_rate = _facet_pass_rate("treatment")
    regional_passed, regional_assessed, regional_pass_rate = _facet_pass_rate("regional")

    return {
        "total_cases": total,
        "technical_passed": technical_passed,
        "routing_passed":   routing_passed,
        "tool_passed":      tool_passed,
        "failed_cases":     failed,
        # Answer Relevancy
        "answer_relevancy_evaluated":  answer_relevancy_evaluated,
        "answer_relevancy_passed":     answer_relevancy_passed,
        "answer_relevancy_mean_score": answer_relevancy_mean_score,
        # Skip counts (pending retrieval_context from AI service)
        "faithfulness_skipped":         faithfulness_skipped,
        "contextual_relevancy_skipped": contextual_relevancy_skipped,
        # gdb_match_score (custom, non-DeepEval)
        "gdb_match_score_evaluated":    gdb_match_score_evaluated,
        "gdb_match_score_mean_score":   gdb_match_score_mean_score,
        # agricultural_correctness (custom, facet-decomposed)
        "agricultural_correctness_evaluated":  agricultural_correctness_evaluated,
        "agricultural_correctness_mean_score": agricultural_correctness_mean_score,
        "agricultural_correctness_facet_crop_passed":      crop_passed,
        "agricultural_correctness_facet_crop_assessed":    crop_assessed,
        "agricultural_correctness_facet_crop_pass_rate":   crop_pass_rate,
        "agricultural_correctness_facet_treatment_passed": treatment_passed,
        "agricultural_correctness_facet_treatment_assessed": treatment_assessed,
        "agricultural_correctness_facet_treatment_pass_rate": treatment_pass_rate,
        "agricultural_correctness_facet_regional_passed":   regional_passed,
        "agricultural_correctness_facet_regional_assessed": regional_assessed,
        "agricultural_correctness_facet_regional_pass_rate": regional_pass_rate,
    }

QUALITY_METRICS = [
    "AnswerRelevancyMetric",
    "FaithfulnessMetric",
    "ContextualRelevancyMetric",
    "GDBMatchScore",
    "CropCorrectness",
    "TreatmentCorrectness",
    "RegionCorrectness",
]


def build_domain_quality_breakdown(results: list[dict]) -> dict:
    """
    Per expected_domain, average score for each of the 5 quality metrics.

    Only numeric scores are averaged; missing/None scores (disabled mode,
    answer_missing, metric errors) are skipped for that metric.
    """
    breakdown: dict[str, dict[str, dict]] = {}

    for result in results:
        domain = result.get("expected_domain") or "Unknown"
        domain_scores = breakdown.setdefault(domain, {})

        for metric_name in QUALITY_METRICS:
            score = result.get(f"{metric_name.lower()}_score")

            if not isinstance(score, (int, float)):
                continue

            metric_entry = domain_scores.setdefault(
                metric_name, {"sum": 0.0, "count": 0}
            )
            metric_entry["sum"] += score
            metric_entry["count"] += 1

    return {
        domain: {
            metric_name: round(metric_entry["sum"] / metric_entry["count"], 4)
            for metric_name, metric_entry in domain_scores.items()
        }
        for domain, domain_scores in breakdown.items()
    }


def build_summary(results: list[dict]) -> dict:
    total = len(results)

    technical_passed = sum(1 for r in results if r.get("technical_pass") is True)
    routing_passed = sum(1 for r in results if r.get("routing_pass") is True)
    tool_passed = sum(1 for r in results if r.get("tool_pass") is True)

    failed = total - technical_passed

    return {
        "total_cases": total,
        "technical_passed": technical_passed,
        "routing_passed": routing_passed,
        "tool_passed": tool_passed,
        "failed_cases": failed,
        "domain_quality_breakdown": build_domain_quality_breakdown(results),
    }
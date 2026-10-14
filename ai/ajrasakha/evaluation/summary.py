from collections import defaultdict


def build_summary(results: list[dict]) -> dict:
    total = len(results)

    technical_passed = sum(1 for r in results if r.get("technical_pass") is True)
    routing_passed = sum(1 for r in results if r.get("routing_pass") is True)
    tool_passed = sum(1 for r in results if r.get("tool_pass") is True)

    quality_evaluated = [r for r in results if r.get("answer_quality_enabled") is True]
    quality_passed = sum(1 for r in quality_evaluated if r.get("quality_pass") is True)

    failed = total - technical_passed

    # Per-domain average overall quality score, so the AI team can see
    # which of the 6 domains (weather/market/soil/schemes/gdb/greetings)
    # needs prompt or retrieval work, not just a single global number.
    domain_scores = defaultdict(list)
    for r in quality_evaluated:
        domain = r.get("domain") or r.get("expected_domain") or "unmapped"
        score = r.get("quality_overall_score")
        if isinstance(score, (int, float)):
            domain_scores[domain].append(score)

    avg_quality_score_by_domain = {
        domain: round(sum(scores) / len(scores), 4)
        for domain, scores in domain_scores.items()
    }

    return {
        "total_cases": total,
        "technical_passed": technical_passed,
        "routing_passed": routing_passed,
        "tool_passed": tool_passed,
        "failed_cases": failed,
        "quality_cases_evaluated": len(quality_evaluated),
        "quality_passed": quality_passed,
        "avg_quality_score_by_domain": avg_quality_score_by_domain,
    }

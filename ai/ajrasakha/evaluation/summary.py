def build_summary(results: list[dict]) -> dict:
    total = len(results)

    technical_passed = sum(1 for r in results if r.get("technical_pass") is True)
    routing_passed = sum(1 for r in results if r.get("routing_pass") is True)
    tool_passed = sum(1 for r in results if r.get("tool_pass") is True)

    failed = total - technical_passed

    # Quality scoring stats
    quality_results = [r for r in results if r.get("answer_quality_enabled") is True]
    quality_evaluated = len(quality_results)
    quality_passed = sum(1 for r in quality_results if r.get("quality_pass") is True)

    relevance_scores = [
        r.get("relevance_score") for r in quality_results
        if isinstance(r.get("relevance_score"), (int, float))
    ]
    faithfulness_scores = [
        r.get("faithfulness_score") for r in quality_results
        if isinstance(r.get("faithfulness_score"), (int, float))
    ]

    avg_relevance = round(sum(relevance_scores) / len(relevance_scores), 3) if relevance_scores else None
    avg_faithfulness = round(sum(faithfulness_scores) / len(faithfulness_scores), 3) if faithfulness_scores else None

    return {
        "total_cases": total,
        "technical_passed": technical_passed,
        "routing_passed": routing_passed,
        "tool_passed": tool_passed,
        "failed_cases": failed,
        "quality_evaluated": quality_evaluated,
        "quality_passed": quality_passed,
        "avg_relevance_score": avg_relevance,
        "avg_faithfulness_score": avg_faithfulness,
    }
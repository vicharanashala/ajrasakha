def build_summary(results: list[dict]) -> dict:
    total = len(results)

    technical_passed = sum(1 for r in results if r.get("technical_pass") is True)
    routing_passed = sum(1 for r in results if r.get("routing_pass") is True)
    tool_passed = sum(1 for r in results if r.get("tool_pass") is True)
    plan_passed = sum(1 for r in results if r.get("plan_pass") is True)
    source_passed = sum(
        1
        for r in results
        if r.get("source_attribution_pass") is True
        and r.get("source_url_pass") is True
    )
    disclaimer_passed = sum(
        1 for r in results if r.get("disclaimer_language_pass") is True
    )

    failed = total - technical_passed

    return {
        "total_cases": total,
        "technical_passed": technical_passed,
        "routing_passed": routing_passed,
        "tool_passed": tool_passed,
        "plan_passed": plan_passed,
        "source_passed": source_passed,
        "disclaimer_passed": disclaimer_passed,
        "failed_cases": failed,
    }

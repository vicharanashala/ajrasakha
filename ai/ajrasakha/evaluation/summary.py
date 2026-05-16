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
    }
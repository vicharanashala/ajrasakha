from ajrasakha.evaluation.all_tools import normalize_tool_name


def evaluate_tools(result: dict, case: dict) -> dict:
    if result.get("graph_status") != "success":
        return {
            "tool_pass": "not_evaluated",
        }

    expected_tools = [
        normalize_tool_name(tool)
        for tool in case.get("expected_tools", [])
    ]

    observed_tools_raw = result.get("observed_tools", "")
    observed_tools = [
        normalize_tool_name(tool)
        for tool in observed_tools_raw.split(",")
        if tool.strip()
    ]

    if not expected_tools:
        return {
            "tool_pass": len(observed_tools) == 0,
        }

    passed = all(
        any(expected in observed for observed in observed_tools)
        for expected in expected_tools
    )

    return {
        "tool_pass": passed,
    }

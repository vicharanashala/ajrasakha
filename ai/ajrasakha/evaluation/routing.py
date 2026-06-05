def evaluate_routing(result: dict, case: dict) -> dict:
    if result.get("graph_status") != "success":
        return {
            "routing_pass": "not_evaluated",
            "expected_tools": ",".join(case.get("expected_tools", [])),
            "observed_tools": result.get("observed_tools", ""),
        }

    expected_tools = set(case.get("expected_tools", []))

    observed_raw = result.get("observed_tools", "")
    observed_tools = set(
        tool.strip()
        for tool in observed_raw.split(",")
        if tool.strip()
    )

    if not expected_tools:
        passed = not observed_tools
    else:
        passed = expected_tools.issubset(observed_tools)

    return {
        "routing_pass": passed,
        "expected_tools": ",".join(expected_tools),
        "observed_tools": ",".join(observed_tools),
    }
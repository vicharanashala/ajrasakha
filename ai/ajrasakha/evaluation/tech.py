def evaluate_technical(result: dict, case: dict) -> dict:
    max_latency = case.get("max_latency_seconds", 120)

    passed = (
        result.get("http_status") == 200
        and result.get("graph_status") == "success"
        and not result.get("error")
        and result.get("latency_seconds", 999) <= max_latency
    )

    return {
        "technical_pass": passed,
    }
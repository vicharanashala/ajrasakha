def classify_failure(result: dict) -> dict:
    if result.get("technical_pass") is False:
        if result.get("http_status") != 200:
            reason = "api_request_failed"
        elif result.get("graph_status") == "error":
            reason = "graph_execution_failed"
        elif result.get("error"):
            reason = "runtime_error"
        else:
            reason = "technical_validation_failed"

    elif result.get("routing_pass") is False:
        reason = "routing_validation_failed"

    else:
        reason = ""

    return {
        "failure_reason": reason
    }
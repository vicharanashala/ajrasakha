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

    elif result.get("tool_pass") is False:
        reason = "tool_validation_failed"

    elif result.get("plan_pass") is False:
        reason = "plan_validation_failed"

    elif result.get("source_attribution_pass") is False:
        reason = "source_attribution_failed"

    elif result.get("source_url_pass") is False:
        reason = "source_url_validation_failed"

    elif result.get("disclaimer_language_pass") is False:
        reason = "disclaimer_language_failed"

    else:
        reason = ""

    return {
        "failure_reason": reason
    }

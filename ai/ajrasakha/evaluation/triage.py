def triage_result(result: dict) -> dict:
    failure_reason = result.get("failure_reason", "")
    error = (result.get("error") or "").lower()
    graph_status = result.get("graph_status")

    if not failure_reason:
        return {
            "triage_category": "passed",
            "triage_action": "no_action",
            "severity": "",
        }

    if "auth" in error or "api_key" in error or "credentials" in error:
        return {
            "triage_category": "config_issue",
            "triage_action": "fix_env_or_credentials",
            "severity": "high",
        }

    if failure_reason == "graph_execution_failed":
        return {
            "triage_category": "runtime_issue",
            "triage_action": "inspect_graph_logs",
            "severity": "high",
        }

    if failure_reason == "routing_validation_failed":
        return {
            "triage_category": "product_bug_candidate",
            "triage_action": "assign_to_orchestration_owner",
            "severity": "high",
        }

    if failure_reason == "tool_validation_failed":
        return {
            "triage_category": "tool_routing_issue",
            "triage_action": "inspect_expected_vs_observed_tools",
            "severity": "high",
        }

    if failure_reason == "plan_validation_failed":
        return {
            "triage_category": "planner_expectation_mismatch",
            "triage_action": "inspect_planner_output_or_update_case_expectation",
            "severity": "medium",
        }

    if failure_reason in {
        "source_attribution_failed",
        "source_url_validation_failed",
    }:
        return {
            "triage_category": "source_attribution_issue",
            "triage_action": "inspect_response_sources_or_validator_expectation",
            "severity": "medium",
        }

    if failure_reason == "disclaimer_language_failed":
        return {
            "triage_category": "disclaimer_language_issue",
            "triage_action": "inspect_disclaimer_language_validator",
            "severity": "medium",
        }

    if result.get("quality_pass") is False:
        return {
            "triage_category": "answer_quality_issue",
            "triage_action": "send_for_domain_or_prompt_review",
            "severity": "medium",
        }

    if graph_status == "error":
        return {
            "triage_category": "needs_review",
            "triage_action": "manual_triage_required",
            "severity": "medium",
        }

    return {
        "triage_category": "needs_review",
        "triage_action": "manual_triage_required",
        "severity": "low",
    }

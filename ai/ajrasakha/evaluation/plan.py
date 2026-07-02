def evaluate_plan(result: dict, case: dict) -> dict:
    trace = result.get("trace") or {}
    observed_plan = trace.get("plan") or {}
    expected_plan = case.get("expected_plan") or {}

    expected_domain = case.get("expected_domain", "")
    observed_domain = observed_plan.get("domain", "")

    failures = []

    if expected_domain and observed_domain and expected_domain != observed_domain:
        failures.append(
            f"domain: expected={expected_domain}, observed={observed_domain}"
        )

    entities = observed_plan.get("entities") or {}

    for key, expected_value in expected_plan.items():
        if key in {"state", "crop", "district"}:
            observed_value = (
                entities.get(key)
                if key in entities
                else observed_plan.get(key)
            )
        else:
            observed_value = observed_plan.get(key)

        if observed_value != expected_value:
            failures.append(
                f"{key}: expected={expected_value}, observed={observed_value}"
            )

    return {
        "expected_domain": expected_domain,
        "observed_domain": observed_domain,
        "expected_plan": str(expected_plan),
        "observed_plan": str(observed_plan),
        "plan_pass": not failures,
        "plan_reason": "; ".join(failures),
    }
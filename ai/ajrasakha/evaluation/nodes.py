def evaluate_nodes(result: dict, case: dict) -> dict:
    trace = result.get("trace") or {}
    observed_nodes = trace.get("nodes") or []
    expected_nodes = case.get("expected_nodes") or []

    missing_nodes = [
        node for node in expected_nodes
        if node not in observed_nodes
    ]

    return {
        "expected_nodes": ",".join(expected_nodes),
        "observed_nodes": ",".join(observed_nodes),
        "node_pass": not missing_nodes,
        "node_reason": "" if not missing_nodes else f"missing_nodes={missing_nodes}",
    }
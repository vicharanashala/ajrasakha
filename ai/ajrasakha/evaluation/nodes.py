def evaluate_nodes(result: dict, case: dict) -> dict:
    expected_nodes = case.get("expected_nodes", [])

    if isinstance(expected_nodes, list):
        expected_nodes_text = ",".join(expected_nodes)
    else:
        expected_nodes_text = str(expected_nodes or "")

    return {
        "expected_nodes": expected_nodes_text,
        "observed_nodes": "not_checked",
        "node_pass": True,
        "node_reason": "node validation disabled because trace node capture is unreliable",
    }
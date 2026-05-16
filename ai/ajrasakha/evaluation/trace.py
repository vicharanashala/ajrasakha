def extract_trace_summary(result: dict) -> dict:
    trace = result.get("trace", {})

    nodes = trace.get("nodes", [])
    tools = trace.get("tools", [])
    mcp_services = trace.get("mcp_services", [])
    errors = trace.get("errors", [])

    return {
        "executed_nodes": ",".join(nodes),
        "executed_tools": ",".join(tools),
        "executed_mcp_services": ",".join(mcp_services),
        "trace_errors": ",".join(errors),
    }
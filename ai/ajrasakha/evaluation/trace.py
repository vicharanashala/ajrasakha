from ajrasakha.evaluation.all_tools import infer_mcp_services


def extract_trace_summary(result: dict) -> dict:
    trace = result.get("trace", {})

    nodes = trace.get("nodes", [])
    errors = trace.get("errors", [])

    observed_tools_raw = result.get("observed_tools", "")
    observed_tools = [
        tool.strip()
        for tool in observed_tools_raw.split(",")
        if tool.strip()
    ]

    if trace.get("tools"):
        tools = trace.get("tools", [])
    else:
        tools = observed_tools

    if trace.get("mcp_services"):
        mcp_services = trace.get("mcp_services", [])
    else:
        mcp_services = infer_mcp_services(tools)

    return {
        "executed_nodes": ",".join(nodes),
        "executed_tools": ",".join(tools),
        "executed_mcp_services": ",".join(mcp_services),
        "trace_errors": ",".join(errors),
    }
import json
import re
import time
import httpx
import os

LIVE_API_URL = os.getenv("LIVE_API_URL", "http://localhost:2026")
ASSISTANT_ID = os.getenv("ASSISTANT_ID", "")


def extract_tools_from_response(response_text: str) -> list[str]:
    """
    Quick live extraction for current Aegra/LangGraph response payload.
    Later this should be replaced with direct trace/event extraction.
    """
    tools = set()

    # First try proper JSON parsing.
    try:
        data = json.loads(response_text)

        for message in data.get("messages", []):
            content = message.get("content", [])

            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        name = block.get("name")
                        if name:
                            tools.add(name)

    except Exception:
        pass

    # Fallback for partially serialized/truncated payloads.
    matches = re.findall(r'"name"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"tool_use"', response_text)
    tools.update(matches)

    return sorted(tools)


def run_mock_case(case: dict) -> dict:
    start_time = time.time()
    expected_tools = case.get("expected_tools", [])

    trace = {
        "nodes": [
            "query_parser_node",
            "routing_node",
            "response_node",
        ],
        "tools": expected_tools,
        "mcp_services": [
            f"mcp-{tool}"
            for tool in expected_tools
        ],
        "errors": [],
    }

    response_text = f"Mock response for {case['name']}"

    return {
        "name": case.get("name"),
        "query": case.get("query"),
        "expected_tools": ",".join(expected_tools),
        "observed_tools": ",".join(expected_tools),
        "http_status": 200,
        "graph_status": "success",
        "latency_seconds": round(time.time() - start_time, 2),
        "response_text": response_text,
        "error": "",
        "trace": trace,
    }


def build_live_payload(query: str) -> dict:
    return {
        "assistant_id": ASSISTANT_ID,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": query,
                }
            ],
            "latitude": None,
            "longitude": None,
        },
        "stream": True,
        "stream_mode": "values",
    }


def run_live_case(case: dict) -> dict:
    start_time = time.time()
    graph_status = "unknown"
    error = ""
    response_text = ""
    http_status = None

    try:
        with httpx.stream(
            "POST",
            LIVE_API_URL,
            json=build_live_payload(case["query"]),
            timeout=120,
        ) as response:
            http_status = response.status_code
            current_event = None

            for line in response.iter_lines():
                if not line:
                    continue

                if line.startswith("event: "):
                    current_event = line.replace("event: ", "", 1)

                elif line.startswith("data: "):
                    data = line.replace("data: ", "", 1)

                    if current_event == "error":
                        graph_status = "error"
                        error = data

                    elif current_event == "end":
                        if '"status":"success"' in data:
                            graph_status = "success"
                        elif '"status":"error"' in data:
                            graph_status = "error"

                    elif current_event == "values":
                        # Keep latest full values payload for parsing.
                        response_text = data

    except Exception as exc:
        graph_status = "error"
        error = str(exc)

    observed_tools_list = extract_tools_from_response(response_text)

    return {
        "name": case.get("name"),
        "query": case.get("query"),
        "expected_tools": ",".join(case.get("expected_tools", [])),
        "observed_tools": ",".join(observed_tools_list),
        "http_status": http_status,
        "graph_status": graph_status,
        "latency_seconds": round(time.time() - start_time, 2),
        "response_text": response_text[:500],
        "error": error[:500],
    }
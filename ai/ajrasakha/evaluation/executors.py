from __future__ import annotations

import json
import os
import re
import time

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv():
        return None

load_dotenv()

LIVE_API_URL = os.getenv("LIVE_API_URL", "http://localhost:2026/runs/stream")
ASSISTANT_ID = os.getenv("ASSISTANT_ID", "")


def extract_tools_from_response(response_text: str) -> list[str]:
    tools = set()

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

            tool_calls = message.get("tool_calls", [])
            if isinstance(tool_calls, list):
                for call in tool_calls:
                    name = call.get("name")
                    if name:
                        tools.add(name)

    except Exception:
        pass

    matches = re.findall(
        r'"name"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"tool_use"',
        response_text,
    )
    tools.update(matches)

    matches = re.findall(
        r'"name"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"tool_call"',
        response_text,
    )
    tools.update(matches)

    return sorted(tools)

def extract_nodes_from_response(events: list[dict], response_text: str) -> list[str]:
    observed = set()

    known_nodes = [
        "planner",
        "clarify",
        "ensure_location",
        "execute_plan",
        "retrieval_sanitizer",
        "upload_reviewer_only",
        "non_agriculture_reply",
        "weather_unavailable_reply",
        "assemble_answer_body",
        "empty_gdb_reply",
        "translate_answer",
    ]

    for event in events:
        event_name = event.get("event", "")
        data = event.get("data", "")

        combined = f"{event_name} {data}"

        for node in known_nodes:
            if node in combined:
                observed.add(node)

    for node in known_nodes:
        if node in response_text:
            observed.add(node)

    return sorted(observed)  

def extract_plan_from_response(response_text: str) -> dict:
    try:
        data = json.loads(response_text)

        if isinstance(data, dict):
            if isinstance(data.get("plan"), dict):
                return data["plan"]

            values = data.get("values")
            if isinstance(values, dict) and isinstance(values.get("plan"), dict):
                return values["plan"]

    except Exception:
        pass

    return {}

def run_mock_case(case: dict) -> dict:
    start_time = time.time()
    expected_tools = case.get("expected_tools", [])

    expected_nodes = case.get("expected_nodes", [])

    trace = {
    "nodes": expected_nodes,
    "plan": case.get("expected_plan", {}),
    "tools": expected_tools,
    "mcp_services": [f"mcp-{tool}" for tool in expected_tools],
    "errors": [],
}

    response_text = case.get("mock_response_text") or f"Mock response for {case['name']}"

    return {
        "name": case.get("name"),
        "query": case.get("query"),
        "expected_tools": ",".join(expected_tools),
        "observed_tools": ",".join(expected_tools),
        "http_status": 200,
        "graph_status": "success",
        "latency_seconds": round(time.time() - start_time, 2),
        "response_text": response_text,
        "observed_gdb_entry_id": case.get("mock_retrieved_gdb_entry_id", ""),
        "error": "",
        "trace": trace,
    }


def build_live_payload(query: str, location: dict | None = None) -> dict:
    return {
        "assistant_id": ASSISTANT_ID,
        "input": {
    "messages": [
        {
            "role": "user",
            "content": query,
        }
    ],
    "location": location,
},
        "stream": True,
        "stream_mode": "values",
    }


def parse_sse_line(line: str) -> tuple[str | None, str | None]:
    if line.startswith("event: "):
        return line.replace("event: ", "", 1).strip(), None

    if line.startswith("data: "):
        return None, line.replace("data: ", "", 1).strip()

    return None, None


def run_live_case(case: dict) -> dict:
    import httpx

    start_time = time.time()

    graph_status = "unknown"
    error = ""
    response_text = ""
    http_status = None
    events = []
    last_values_payload = ""

    try:
        payload = build_live_payload(case["query"], case.get("location"))

        with httpx.stream(
            "POST",
            LIVE_API_URL,
            json=payload,
            timeout=120,
        ) as response:
            http_status = response.status_code

            if response.status_code >= 400:
                error = response.read().decode("utf-8", errors="replace")
                graph_status = "error"
                return {
                    "name": case.get("name"),
                    "query": case.get("query"),
                    "expected_tools": ",".join(case.get("expected_tools", [])),
                    "observed_tools": "",
                    "http_status": http_status,
                    "graph_status": graph_status,
                    "latency_seconds": round(time.time() - start_time, 2),
                    "response_text": "",
                    "error": error[:500],
                    "trace": {
                        "nodes": [],
                        "tools": [],
                        "mcp_services": [],
                        "errors": [error[:500]],
                    },
                }

            current_event = None

            for line in response.iter_lines():
                if not line:
                    continue

                event_name, data = parse_sse_line(line)

                if event_name:
                    current_event = event_name
                    continue

                if data is None:
                    continue

                events.append(
                    {
                        "event": current_event,
                        "data": data,
                    }
                )

                # Store all data as fallback so extraction still has something.
                if data:
                    response_text = data

                if current_event == "values":
                    last_values_payload = data
                    response_text = data

                elif current_event == "error":
                    graph_status = "error"
                    error = data

                elif current_event == "end":
                    if '"status":"success"' in data:
                        graph_status = "success"
                    elif '"status":"error"' in data:
                        graph_status = "error"

            if graph_status == "unknown" and last_values_payload:
                graph_status = "success"

    except Exception as exc:
        graph_status = "error"
        error = repr(exc)

    full_stream_text = "\n".join(
        event.get("data", "")
        for event in events
        if event.get("data")
    )

    extraction_source = last_values_payload or response_text or full_stream_text
    observed_tools_list = extract_tools_from_response(extraction_source)
    observed_nodes = extract_nodes_from_response(events, full_stream_text)  
    observed_plan = extract_plan_from_response(extraction_source)

    return {
        "name": case.get("name"),
        "query": case.get("query"),
        "expected_tools": ",".join(case.get("expected_tools", [])),
        "observed_tools": ",".join(observed_tools_list),
        "http_status": http_status,
        "graph_status": graph_status,
        "latency_seconds": round(time.time() - start_time, 2),
        "response_text": extraction_source[:500],
        "error": error[:500],
        "trace": {
            "nodes": observed_nodes,
            "plan": observed_plan,
            "tools": observed_tools_list,
            "mcp_services": [],
            "errors": [error[:500]] if error else [],
        },
    }

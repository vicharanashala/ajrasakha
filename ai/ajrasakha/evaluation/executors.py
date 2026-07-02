import hashlib
import hmac
import json
import os
import re
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

load_dotenv()

LIVE_API_URL = os.getenv("LIVE_API_URL", "")
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


def extract_nodes_from_response(response_text: str) -> list[str]:
    known_nodes = [
        "planner",
        "clarify",
        "ensure_location",
        "execute_plan",
        "retrieval_sanitizer",
        "synthesize",
        "empty_gdb_reply",
    ]

    return [node for node in known_nodes if node in response_text]


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
    observed_nodes = extract_nodes_from_response(full_stream_text)
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


def _whatsapp_error_result(case: dict, http_status, error: str, start_time: float) -> dict:
    """Helper to return a consistent error result structure."""
    return {
        "name": case.get("name"),
        "query": case.get("query"),
        "expected_tools": ",".join(case.get("expected_tools", [])),
        "observed_tools": "",
        "http_status": http_status,
        "graph_status": "error",
        "latency_seconds": round(time.time() - start_time, 2),
        "response_text": "",
        "error": error[:500],
        "trace": {
            "nodes": [],
            "plan": {},
            "tools": [],
            "mcp_services": [],
            "errors": [error[:500]],
        },
    }


def run_whatsapp_case(case: dict) -> dict:
    """
    Simulates a farmer sending a WhatsApp message and captures the AI response.
    Hits wa-client webhook directly, bypassing Meta entirely.
    Polls LangGraph thread state to capture the AI response.
    """

    # STEP 1: Read environment variables
    webhook_url = os.getenv("WHATSAPP_WEBHOOK_URL")
    internal_api_key = os.getenv("WHATSAPP_INTERNAL_API_KEY")
    phone_number = os.getenv("WHATSAPP_TEST_PHONE_NUMBER")
    app_secret = os.getenv("WHATSAPP_META_APP_SECRET")

    if not webhook_url or not internal_api_key or not phone_number or not app_secret:
        raise ValueError(
            "Missing environment variables. Required: WHATSAPP_WEBHOOK_URL, "
            "WHATSAPP_INTERNAL_API_KEY, WHATSAPP_TEST_PHONE_NUMBER, "
            "WHATSAPP_META_APP_SECRET"
        )

    # STEP 2: Figure out where LangGraph server is
    live_url = os.getenv("LIVE_API_URL", "").strip()
    if not live_url:
        raise ValueError("Missing required environment variable: LIVE_API_URL")
    parsed_url = urlparse(live_url)
    langgraph_base = f"{parsed_url.scheme}://{parsed_url.netloc}"

    # STEP 3: Build the thread ID and state URL
    # wa-client creates one LangGraph thread per farmer per day
    # Thread ID format: {phone_number}-{YYYY-MM-DD} in Kolkata timezone
    kolkata_tz = timezone(timedelta(hours=5, minutes=30))
    date_str = datetime.now(kolkata_tz).strftime('%Y-%m-%d')
    thread_id = f"{phone_number}-{date_str}"
    state_url = f"{langgraph_base}/threads/{thread_id}/state"

    # STEP 4: Check how many messages exist before we send
    initial_count = 0
    try:
        resp = httpx.get(state_url, timeout=10)
        if resp.status_code == 200:
            initial_count = len(
                resp.json().get("values", {}).get("messages", [])
            )
    except Exception:
        pass

    start_time = time.time()

    # STEP 5: Build the WhatsApp webhook payload
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "1234567890",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15555555555",
                                "phone_number_id": "1234567890"
                            },
                            "contacts": [
                                {
                                    "profile": {"name": "Test Farmer"},
                                    "wa_id": phone_number
                                }
                            ],
                            "messages": [
                                {
                                    "from": phone_number,
                                    "id": f"wamid.E2E_{int(start_time)}_{case['name']}",
                                    "timestamp": str(int(start_time)),
                                    "type": "text",
                                    "text": {"body": case["query"]}
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }

    # STEP 6: Sign the payload with HMAC-SHA256
    raw_body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    signature = "sha256=" + hmac.new(
        app_secret.encode('utf-8'),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    headers = {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature
    }

    # STEP 7: Send the fake farmer message to wa-client webhook
    http_status = None
    error = ""
    graph_status = "error"
    response_text = ""
    observed_tools_list = []
    observed_plan = {}

    try:
        webhook_resp = httpx.post(
            webhook_url,
            content=raw_body,
            headers=headers,
            timeout=30
        )
        http_status = webhook_resp.status_code
        if webhook_resp.status_code >= 400:
            error = f"Webhook rejected: {webhook_resp.status_code} {webhook_resp.text}"
            return _whatsapp_error_result(case, http_status, error, start_time)

    except Exception as exc:
        error = f"Webhook request failed: {repr(exc)}"
        return _whatsapp_error_result(case, http_status, error, start_time)

    # STEP 8: Poll LangGraph thread state until AI response appears
    start_poll = time.time()
    while time.time() - start_poll < 90:
        time.sleep(2)
        try:
            state_resp = httpx.get(state_url, timeout=10)
            if state_resp.status_code == 200:
                state_data = state_resp.json()
                messages = state_data.get("values", {}).get("messages", [])
                if len(messages) > initial_count:
                    last_human_idx = -1
                    for idx, message in enumerate(messages):
                        if (
                            message.get("type") == "human"
                            or message.get("role") == "user"
                        ):
                            last_human_idx = idx

                    new_messages = (
                        messages[last_human_idx + 1:]
                        if last_human_idx != -1
                        else []
                    )
                    ai_messages = [
                        message
                        for message in new_messages
                        if (
                            message.get("type") == "ai"
                            or message.get("role") == "assistant"
                        )
                    ]
                    response_message = next(
                        (
                            message
                            for message in reversed(ai_messages)
                            if message.get("content")
                        ),
                        None,
                    )

                    if response_message:
                        content = response_message.get("content")
                        if isinstance(content, str):
                            response_text = content.strip()
                        elif isinstance(content, list):
                            response_text = "".join(
                                b.get("text", "")
                                for b in content
                                if b.get("type") == "text"
                            ).strip()

                        tools_set = set()
                        for message in new_messages:
                            for tool_call in message.get("tool_calls", []):
                                if tool_call.get("name"):
                                    tools_set.add(tool_call["name"])
                            if (
                                message.get("type") == "tool"
                                or message.get("role") == "tool"
                            ) and message.get("name"):
                                tools_set.add(message["name"])

                        observed_tools_list = sorted(list(tools_set))

                        plan_data = state_data.get("values", {}).get("plan")
                        if isinstance(plan_data, dict):
                            observed_plan = plan_data

                        graph_status = "success"
                        break

        except Exception as exc:
            error = f"Poll error: {repr(exc)}"

    if graph_status != "success":
        error = error or "Timeout waiting for AI response in LangGraph thread state"

    return {
        "name": case.get("name"),
        "query": case.get("query"),
        "expected_tools": ",".join(case.get("expected_tools", [])),
        "observed_tools": ",".join(observed_tools_list),
        "http_status": http_status,
        "graph_status": graph_status,
        "latency_seconds": round(time.time() - start_time, 2),
        "response_text": response_text,
        "error": error[:500],
        "trace": {
            "nodes": [],
            "plan": observed_plan,
            "tools": observed_tools_list,
            "mcp_services": [],
            "errors": [error[:500]] if error else [],
        },
    }

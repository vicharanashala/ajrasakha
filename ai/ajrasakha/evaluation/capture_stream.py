"""Capture the last `values` event from a LangGraph `/runs/stream` call.

Writes the graph state (messages, plan, location) to a JSON file so the
extractors can be tested without a live bot.

Usage (PowerShell, from `ai/`):

    py -m ajrasakha.evaluation.capture_stream `
        --query "How to grow paddy in punjab" `
        --city Ropar --state Punjab `
        --out values_gdb_question_1.json

Defaults come from the environment:
    LIVE_API_URL   (default http://127.0.0.1:2026/runs/stream)
    ASSISTANT_ID   (default ajrasakha_agent)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Iterator
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

DEFAULT_LIVE_API_URL = "http://127.0.0.1:2026/runs/stream"
DEFAULT_ASSISTANT_ID = "ajrasakha_agent"
DEFAULT_QUERY = "How to grow paddy in punjab"
DEFAULT_TIMEOUT_SECONDS = 180


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Call the bot's /runs/stream endpoint and save the last 'values' "
            "event as pretty-printed JSON."
        )
    )
    parser.add_argument("--query", default=DEFAULT_QUERY, help="Farmer question to send.")
    parser.add_argument("--city", default=None, help="Optional city for the location block.")
    parser.add_argument("--state", default=None, help="Optional state for the location block.")
    parser.add_argument(
        "--out",
        default="values_capture.json",
        help="Output JSON file (default: values_capture.json).",
    )
    parser.add_argument(
        "--url",
        default=os.getenv("LIVE_API_URL", DEFAULT_LIVE_API_URL),
        help="Stream endpoint (default: LIVE_API_URL or %(default)s).",
    )
    parser.add_argument(
        "--assistant-id",
        default=os.getenv("ASSISTANT_ID") or DEFAULT_ASSISTANT_ID,
        help="Graph/assistant id (default: ASSISTANT_ID or %(default)s).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Read timeout in seconds (default: %(default)s).",
    )
    return parser.parse_args(argv)


def build_payload(
    query: str,
    assistant_id: str,
    city: str | None = None,
    state: str | None = None,
) -> dict:
    location = {}
    if city:
        location["city"] = city
    if state:
        location["state"] = state

    return {
        "assistant_id": assistant_id,
        "input": {
            "messages": [{"role": "user", "content": query}],
            "location": location or None,
        },
        "stream": True,
        "stream_mode": "values",
    }


def iter_sse_events(lines) -> Iterator[tuple[str | None, str]]:
    """Yield (event_name, data) pairs from raw SSE lines."""
    current_event: str | None = None

    for line in lines:
        if not line:
            continue

        if line.startswith("event:"):
            current_event = line.split(":", 1)[1].strip()
            continue

        if line.startswith("data:"):
            data = line.split(":", 1)[1].strip()
            if data == "[DONE]":
                return
            yield current_event, data


def capture(url: str, payload: dict, timeout: float) -> tuple[str, int]:
    """Return (last values payload, number of data events seen)."""
    last_values = ""
    event_count = 0

    with httpx.stream("POST", url, json=payload, timeout=timeout) as response:
        if response.status_code >= 400:
            body = response.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {response.status_code} from {url}: {body[:500]}")

        for event_name, data in iter_sse_events(response.iter_lines()):
            event_count += 1
            if event_name == "values":
                last_values = data

    return last_values, event_count


def _message_is_gdb_tool(message: dict) -> bool:
    return (
        str(message.get("type") or message.get("role") or "").strip().lower() == "tool"
        and str(message.get("name") or "").strip() == "gdb"
    )


def has_gdb_output(messages: list) -> bool:
    for message in messages:
        if not isinstance(message, dict) or not _message_is_gdb_tool(message):
            continue

        content = message.get("content")
        if isinstance(content, list):
            content = " ".join(
                block.get("text", "")
                for block in content
                if isinstance(block, dict) and isinstance(block.get("text"), str)
            )
        if str(content or "").strip():
            return True

    return False


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = build_payload(args.query, args.assistant_id, args.city, args.state)

    try:
        last_values, event_count = capture(args.url, payload, args.timeout)
    except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
        print(
            f"ERROR: cannot reach the bot at {args.url}\n"
            f"       {type(exc).__name__}: {exc}\n"
            "       Is the graph server running? Start it with "
            "`langgraph dev --port 2026` and try again.",
            file=sys.stderr,
        )
        return 2
    except httpx.HTTPError as exc:
        print(f"ERROR: stream request failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if not last_values:
        print(
            "ERROR: the stream finished without a 'values' event — nothing captured.\n"
            "       Check that the query reached the graph and stream_mode is 'values'.",
            file=sys.stderr,
        )
        return 3

    try:
        state = json.loads(last_values)
    except json.JSONDecodeError as exc:
        print(f"ERROR: last 'values' payload is not valid JSON: {exc}", file=sys.stderr)
        return 4

    out_path = Path(args.out)
    try:
        out_path.write_text(
            json.dumps(state, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError as exc:
        print(f"ERROR: could not write {out_path}: {exc}", file=sys.stderr)
        return 5

    messages = state.get("messages") if isinstance(state, dict) else None
    messages = messages if isinstance(messages, list) else []

    print(f"Endpoint: {args.url}")
    print(f"Events received: {event_count}")
    print(f"Saved: {out_path.resolve()}")
    print(f"Messages: {len(messages)}")
    print(f"GDB tool output present: {has_gdb_output(messages)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""OpenAI chat/completions ↔ LangGraph AjraSakha agent bridge."""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from typing import Any, AsyncIterator, Optional

import httpx

from config import (
    LANGGRAPH_API_KEY,
    LANGGRAPH_ASSISTANT_ID,
    LANGGRAPH_BASE_URL,
    LOCATION_SYNC_TO_DB,
    REQUEST_TIMEOUT,
)
from mongo_user import update_user_location_if_changed
from reviewer_question import (
    fetch_thread_messages,
    link_reviewer_question_after_run,
    resolve_client_ids,
)

logger = logging.getLogger("langgraph-openai-adapter")

# Nodes whose streamed tokens must not be shown to the user (internal tool loop).
_BLOCK_STREAM_NODES = frozenset({"tools"})


def _langgraph_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if LANGGRAPH_API_KEY and LANGGRAPH_API_KEY != "not_required":
        headers["x-api-key"] = LANGGRAPH_API_KEY
    return headers


def _openai_chunk(
    *,
    content: str = "",
    model: str,
    chunk_id: str,
    finish_reason: str | None = None,
    reasoning_content: str | None = None,
) -> dict[str, Any]:
    delta: dict[str, Any] = {}
    if reasoning_content is not None:
        delta["reasoning_content"] = reasoning_content
    if content:
        delta["content"] = content
    return {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": delta,
                "logprobs": None,
                "finish_reason": finish_reason,
            }
        ],
    }


def _extract_text_content(message_chunk: Any) -> str:
    if isinstance(message_chunk, dict):
        content = message_chunk.get("content")
    else:
        content = getattr(message_chunk, "content", None)
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return str(content)


def _message_type(message_chunk: Any) -> str:
    if isinstance(message_chunk, dict):
        return str(message_chunk.get("type") or message_chunk.get("role") or "")
    return str(getattr(message_chunk, "type", "") or "")


# Injected by ajrasakha-client useChatFunctions.ts into promptPrefix / system message.
_LAT_LON_BLOCK_RE = re.compile(
    r"Latitude:\s*([-+]?\d+(?:\.\d+)?)\s*\n\s*Longitude:\s*([-+]?\d+(?:\.\d+)?)",
    re.IGNORECASE,
)
_LAT_LON_LOOSE_RE = re.compile(
    r"latitude[\"']?\s*[:=]\s*([-+]?\d+(?:\.\d+)?).*?longitude[\"']?\s*[:=]\s*([-+]?\d+(?:\.\d+)?)",
    re.IGNORECASE | re.DOTALL,
)


def _normalize_message_content(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return str(content)


def _coords_from_text(text: str) -> dict[str, float] | None:
    for pattern in (_LAT_LON_BLOCK_RE, _LAT_LON_LOOSE_RE):
        match = pattern.search(text)
        if not match:
            continue
        try:
            lat = float(match.group(1))
            lon = float(match.group(2))
        except (TypeError, ValueError):
            continue
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return {"latitude": lat, "longitude": lon}
    return None


def _parse_location_from_messages(messages: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Parse live GPS from LibreChat system prompt (and other message text as fallback)."""
    system_texts: list[str] = []
    other_texts: list[str] = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        text = _normalize_message_content(msg.get("content"))
        if not text:
            continue
        role = (msg.get("role") or "").lower()
        if role == "system":
            system_texts.append(text)
        else:
            other_texts.append(text)

    for text in system_texts + other_texts:
        coords = _coords_from_text(text)
        if coords:
            return coords
    return None


def _parse_location_from_body(body: dict[str, Any]) -> dict[str, Any] | None:
    raw = body.get("location")
    if not isinstance(raw, dict):
        return None
    loc: dict[str, Any] = {}
    # Only lat/lon are forwarded to LangGraph; state/district/city stay out of run_input.
    for key in ("latitude", "longitude"):
        if raw.get(key) is not None:
            loc[key] = raw[key]
    return loc or None


def _merge_location(
    live_location: dict[str, Any] | None,
    body_location: dict[str, Any] | None,
    context_headers: dict[str, str],
) -> dict[str, Any] | None:
    """Resolve coordinates only: live (system prompt) > body.location lat/lon > Mongo lat/lon.

    State, district, city, and address are intentionally omitted from ``run_input["location"]``;
    the agent can derive them via ``location_information_tool`` from coordinates.
    """
    loc: dict[str, Any] = {}
    body_loc = dict(body_location or {})

    if (
        live_location
        and live_location.get("latitude") is not None
        and live_location.get("longitude") is not None
    ):
        loc["latitude"] = float(live_location["latitude"])
        loc["longitude"] = float(live_location["longitude"])
    elif body_loc.get("latitude") is not None and body_loc.get("longitude") is not None:
        try:
            loc["latitude"] = float(body_loc["latitude"])
            loc["longitude"] = float(body_loc["longitude"])
        except (TypeError, ValueError):
            pass
    else:
        lat = context_headers.get("X-Latitude")
        lon = context_headers.get("X-Longitude")
        if lat is not None and lon is not None:
            try:
                loc["latitude"] = float(lat)
                loc["longitude"] = float(lon)
            except (TypeError, ValueError):
                pass

    if loc.get("latitude") is None or loc.get("longitude") is None:
        return None
    return {"latitude": loc["latitude"], "longitude": loc["longitude"]}


def _user_id_from_headers(request_headers: dict[str, str] | None) -> str | None:
    if not request_headers:
        return None
    for key in ("x-user-id", "X-User-ID"):
        value = request_headers.get(key)
        if value and str(value).strip():
            return str(value).strip()
    return None


def _openai_messages_to_langgraph(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for msg in messages:
        role = (msg.get("role") or "user").lower()
        content = msg.get("content")
        if content is None:
            continue
        if role in ("user", "human"):
            out.append({"type": "human", "content": content})
        elif role in ("assistant", "ai"):
            out.append({"type": "ai", "content": content})
        elif role == "system":
            # Graph uses dedicated system prompts; skip client system lines.
            continue
    return out


def _last_user_message(messages: list[dict[str, Any]]) -> dict[str, Any] | None:
    for msg in reversed(messages):
        if (msg.get("role") or "").lower() in ("user", "human"):
            content = msg.get("content")
            if content:
                return {"type": "human", "content": content}
    return None


def resolve_thread_id(body: dict[str, Any], request_headers: dict[str, str]) -> str:
    explicit = body.get("thread_id")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip()
    for key in ("x-conversation-id", "X-Conversation-Id"):
        value = request_headers.get(key)
        if value and value.strip():
            return value.strip()
    return str(uuid.uuid4())


def build_run_config(
    request_headers: dict[str, str],
    thread_id: str,
) -> dict[str, Any]:
    """LangGraph run config for long-term memory (see ajrasakha.py _load_long_term_summary)."""
    configurable: dict[str, Any] = {"thread_id": thread_id}
    for key in ("x-user-id", "X-User-ID"):
        user_id = request_headers.get(key)
        if user_id and str(user_id).strip():
            configurable["user_id"] = str(user_id).strip()
            break
    return {"configurable": configurable}


def build_run_input(
    body: dict[str, Any],
    context_headers: dict[str, str],
    *,
    append_only: bool,
    request_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    openai_messages = body.get("messages") or []
    if not isinstance(openai_messages, list):
        openai_messages = []

    if append_only:
        human = _last_user_message(openai_messages)
        if not human:
            raise ValueError("No user message in request")
        run_input: dict[str, Any] = {"messages": [human]}
    else:
        lg_messages = _openai_messages_to_langgraph(openai_messages)
        if not lg_messages:
            raise ValueError("No user message in request")
        run_input = {"messages": lg_messages}

    live_location = _parse_location_from_messages(openai_messages)
    location = _merge_location(
        live_location,
        _parse_location_from_body(body),
        context_headers,
    )
    if location:
        run_input["location"] = location
        if live_location and LOCATION_SYNC_TO_DB:
            user_id = _user_id_from_headers(request_headers)
            if user_id:
                update_user_location_if_changed(
                    user_id,
                    float(location["latitude"]),
                    float(location["longitude"]),
                )
    return run_input


async def _ensure_thread(client: httpx.AsyncClient, thread_id: str) -> None:
    response = await client.post(
        f"{LANGGRAPH_BASE_URL}/threads",
        json={"thread_id": thread_id},
        headers=_langgraph_headers(),
    )
    if response.status_code in (200, 201, 409):
        return
    # Thread may already exist from a prior run; continue if state endpoint works.
    if response.status_code == 422:
        logger.warning("thread create returned 422 for %s: %s", thread_id, response.text)
        return
    response.raise_for_status()


async def _thread_has_messages(client: httpx.AsyncClient, thread_id: str) -> bool:
    try:
        response = await client.get(
            f"{LANGGRAPH_BASE_URL}/threads/{thread_id}/state",
            headers=_langgraph_headers(),
        )
        if response.status_code == 404:
            return False
        response.raise_for_status()
        values = response.json().get("values") or {}
        messages = values.get("messages") or []
        return len(messages) > 0
    except httpx.HTTPError:
        return False


def _should_emit_message_chunk(message_chunk: Any, metadata: Any) -> bool:
    msg_type = _message_type(message_chunk).lower()
    if msg_type and msg_type not in ("ai", "aimessagechunk", "assistant"):
        return False
    if isinstance(metadata, dict):
        node = metadata.get("langgraph_node") or metadata.get("node")
        if node in _BLOCK_STREAM_NODES:
            return False
    text = _extract_text_content(message_chunk)
    return bool(text)


def _has_tool_calls(message: Any) -> bool:
    if isinstance(message, dict):
        return bool(message.get("tool_calls"))
    return bool(getattr(message, "tool_calls", None))


def _final_ai_reply_from_messages(messages: list[Any]) -> str:
    """Last non-tool-call assistant text for the current turn."""
    if not messages:
        return ""

    last_human_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        msg = messages[i]
        if isinstance(msg, dict) and msg.get("type") == "human":
            last_human_idx = i
            break

    current_run_messages = (
        messages[last_human_idx + 1 :] if last_human_idx >= 0 else messages
    )

    for msg in reversed(current_run_messages):
        if isinstance(msg, dict) and msg.get("type") in ("ai", "assistant"):
            if _has_tool_calls(msg):
                continue
            text = _extract_text_content(msg)
            if text:
                return text
    return ""


async def _emit_final_reply_fallback(
    client: httpx.AsyncClient,
    thread_id: str,
    *,
    model: str,
    chunk_id: str,
    lg_headers: dict[str, str],
) -> str | None:
    """When live token streaming yielded nothing, send final thread AI message."""
    try:
        messages = await fetch_thread_messages(
            client,
            thread_id,
            langgraph_base_url=LANGGRAPH_BASE_URL,
            langgraph_headers=lg_headers,
        )
    except httpx.HTTPError as exc:
        logger.warning(
            "Failed to fetch thread state for reply fallback (thread=%s): %s",
            thread_id,
            exc,
        )
        return None

    reply = _final_ai_reply_from_messages(messages)
    if not reply:
        logger.warning(
            "LangGraph run completed with no streamable assistant text (thread=%s)",
            thread_id,
        )
        return None

    logger.info(
        "Emitting final assistant reply from thread state (thread=%s, len=%d)",
        thread_id,
        len(reply),
    )
    chunk = _openai_chunk(content=reply, model=model, chunk_id=chunk_id)
    return f"data: {json.dumps(chunk)}\n\n"


def _parse_langgraph_sse_line(line: str, current_event: str | None) -> tuple[str | None, Any | None]:
    if line.startswith("event:"):
        return line[6:].strip(), None
    if line.startswith("data:"):
        payload = line[5:].strip()
        if not payload:
            return current_event, None
        try:
            return current_event, json.loads(payload)
        except json.JSONDecodeError:
            return current_event, None
    return current_event, None


async def stream_openai_from_langgraph(
    body: dict[str, Any],
    *,
    request_headers: dict[str, str],
    context_headers: dict[str, str],
    run_meta: dict[str, Any] | None = None,
) -> AsyncIterator[str]:
    """Yield OpenAI-style SSE lines (`data: {...}`)."""
    model = body.get("model") or LANGGRAPH_ASSISTANT_ID
    chunk_id = f"chatcmpl-{uuid.uuid4().hex}"
    thread_id = resolve_thread_id(body, request_headers)
    run_config = build_run_config(request_headers, thread_id)
    user_id, message_id = resolve_client_ids(request_headers, body)
    lg_headers = _langgraph_headers()
    timeout = httpx.Timeout(REQUEST_TIMEOUT, connect=10.0)

    if run_meta is not None:
        run_meta["thread_id"] = thread_id

    async with httpx.AsyncClient(timeout=timeout) as client:
        await _ensure_thread(client, thread_id)
        has_prior = await _thread_has_messages(client, thread_id)
        run_input = build_run_input(
            body,
            context_headers,
            append_only=has_prior,
            request_headers=request_headers,
        )

        payload = {
            "assistant_id": LANGGRAPH_ASSISTANT_ID,
            "input": run_input,
            "config": run_config,
            "stream_mode": ["messages-tuple"],
        }

        url = f"{LANGGRAPH_BASE_URL}/threads/{thread_id}/runs/stream"
        logger.info(
            "langgraph bridge stream thread_id=%s assistant=%s append_only=%s",
            thread_id,
            LANGGRAPH_ASSISTANT_ID,
            has_prior,
        )

        async with client.stream(
            "POST",
            url,
            json=payload,
            headers=lg_headers,
        ) as response:
            if response.status_code >= 400:
                await response.aread()
                response.raise_for_status()

            current_event: str | None = None
            emitted_content = False
            async for line in response.aiter_lines():
                current_event, data = _parse_langgraph_sse_line(line, current_event)
                if data is None:
                    continue

                # messages-tuple: [message_chunk, metadata]
                if current_event not in (None, "messages", "messages-tuple"):
                    continue

                if isinstance(data, list) and len(data) >= 2:
                    message_chunk, metadata = data[0], data[1]
                elif isinstance(data, dict) and "content" in data:
                    message_chunk, metadata = data, {}
                else:
                    continue

                if not _should_emit_message_chunk(message_chunk, metadata):
                    continue

                text = _extract_text_content(message_chunk)
                emitted_content = True
                chunk = _openai_chunk(content=text, model=model, chunk_id=chunk_id)
                yield f"data: {json.dumps(chunk)}\n\n"

            if not emitted_content:
                fallback_line = await _emit_final_reply_fallback(
                    client,
                    thread_id,
                    model=model,
                    chunk_id=chunk_id,
                    lg_headers=lg_headers,
                )
                if fallback_line:
                    yield fallback_line

        reviewer_question_id = await link_reviewer_question_after_run(
            client,
            thread_id,
            user_id,
            message_id,
            langgraph_base_url=LANGGRAPH_BASE_URL,
            langgraph_headers=lg_headers,
        )
        if run_meta is not None:
            run_meta["reviewer_question_id"] = reviewer_question_id

    yield f"data: {json.dumps(_openai_chunk(model=model, chunk_id=chunk_id, finish_reason='stop'))}\n\n"
    yield "data: [DONE]\n\n"


async def complete_openai_from_langgraph(
    body: dict[str, Any],
    *,
    request_headers: dict[str, str],
    context_headers: dict[str, str],
) -> dict[str, Any]:
    """Non-streaming OpenAI chat.completion response."""
    model = body.get("model") or LANGGRAPH_ASSISTANT_ID
    completion_id = f"chatcmpl-{uuid.uuid4().hex}"
    parts: list[str] = []
    run_meta: dict[str, Any] = {}

    async for line in stream_openai_from_langgraph(
        {**body, "stream": True},
        request_headers=request_headers,
        context_headers=context_headers,
        run_meta=run_meta,
    ):
        if not line.startswith("data: "):
            continue
        data_str = line[6:].strip()
        if data_str == "[DONE]":
            break
        try:
            chunk = json.loads(data_str)
        except json.JSONDecodeError:
            continue
        delta = (chunk.get("choices") or [{}])[0].get("delta") or {}
        if delta.get("content"):
            parts.append(delta["content"])

    content = "".join(parts)
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "logprobs": None,
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        "thread_id": run_meta.get("thread_id"),
        "reviewer_question_id": run_meta.get("reviewer_question_id"),
    }

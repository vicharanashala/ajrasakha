"""Extract reviewer question_id from LangGraph tool output and link to desk API."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from config import (
    REQUEST_TIMEOUT,
    REVIEWER_DESK_API_BASE_URL,
    REVIEWER_DESK_API_KEY,
)

logger = logging.getLogger("langgraph-openai-adapter")

UPLOAD_TOOL_NAME = "upload_question_to_reviewer_system"


def _header_value(request_headers: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        value = request_headers.get(key)
        if value and str(value).strip():
            return str(value).strip()
    return None


def resolve_client_ids(
    request_headers: dict[str, str],
    body: dict[str, Any] | None = None,
) -> tuple[str | None, str | None]:
    """Resolve userId and messageId from headers, then body fallback."""
    body = body or {}
    user_id = _header_value(request_headers, "x-user-id", "X-User-ID")
    message_id = _header_value(request_headers, "x-message-id", "X-Message-Id")

    if not user_id:
        raw = body.get("userId")
        if raw and str(raw).strip():
            user_id = str(raw).strip()
    if not message_id:
        raw = body.get("messageId")
        if raw and str(raw).strip():
            message_id = str(raw).strip()

    return user_id, message_id


def _question_id_from_tool_msg(tool_msg: dict[str, Any]) -> str | None:
    artifact = tool_msg.get("artifact") or {}
    structured = artifact.get("structured_content") or {}
    result = structured.get("result") or {}

    for candidate in (
        (result.get("data") or {}).get("question_id"),
        result.get("question_id"),
    ):
        if candidate and str(candidate).strip():
            return str(candidate).strip()

    try:
        content_blocks = tool_msg.get("content")
        if not isinstance(content_blocks, list):
            content_blocks = [content_blocks] if content_blocks is not None else []

        for block in content_blocks:
            text = block if isinstance(block, str) else (block or {}).get("text")
            if not text:
                continue
            parsed = json.loads(text)
            for key_path in (
                lambda p: (p.get("data") or {}).get("question_id"),
                lambda p: p.get("question_id"),
            ):
                candidate = key_path(parsed)
                if candidate and str(candidate).strip():
                    return str(candidate).strip()
    except (json.JSONDecodeError, TypeError):
        pass

    return None


def extract_question_id_from_messages(messages: list[Any]) -> str | None:
    """
    Extract question_id from upload_question_to_reviewer_system tool output
    for the current turn only (messages after the latest human message).
    """
    if not messages:
        return None

    last_human_idx = -1
    for i in range(len(messages) - 1, -1, -1):
        msg = messages[i]
        if isinstance(msg, dict) and msg.get("type") == "human":
            last_human_idx = i
            break

    current_run_messages = (
        messages[last_human_idx + 1 :] if last_human_idx >= 0 else messages
    )

    tool_msg: dict[str, Any] | None = None
    for msg in reversed(current_run_messages):
        if (
            isinstance(msg, dict)
            and msg.get("type") == "tool"
            and msg.get("name") == UPLOAD_TOOL_NAME
        ):
            tool_msg = msg
            break

    if not tool_msg:
        return None

    return _question_id_from_tool_msg(tool_msg)


async def fetch_thread_messages(
    client: httpx.AsyncClient,
    thread_id: str,
    *,
    langgraph_base_url: str,
    langgraph_headers: dict[str, str],
) -> list[Any]:
    response = await client.get(
        f"{langgraph_base_url}/threads/{thread_id}/state",
        headers=langgraph_headers,
    )
    if response.status_code == 404:
        return []
    response.raise_for_status()
    values = response.json().get("values") or {}
    messages = values.get("messages") or []
    return messages if isinstance(messages, list) else []


def _desk_request_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if REVIEWER_DESK_API_KEY:
        headers["x-internal-api-key"] = REVIEWER_DESK_API_KEY
    return headers


async def update_desk_question(
    question_id: str,
    user_id: str,
    message_id: str,
    thread_id: str,
) -> bool:
    url = f"{REVIEWER_DESK_API_BASE_URL}/questions/{question_id}"
    payload = {
        "userId": user_id,
        "messageId": message_id,
        "threadId": thread_id,
    }

    if not REVIEWER_DESK_API_KEY:
        logger.warning(
            "REVIEWER_DESK_API_KEY is not set; desk PUT for question %s may fail authentication",
            question_id,
        )

    timeout = httpx.Timeout(REQUEST_TIMEOUT, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.put(url, json=payload, headers=_desk_request_headers())

    if response.is_success:
        logger.info(
            "Linked desk question %s with userId=%s messageId=%s threadId=%s",
            question_id,
            user_id,
            message_id,
            thread_id,
        )
        return True

    body = response.text
    logger.warning(
        "Desk PUT failed for question %s (status=%s): %s",
        question_id,
        response.status_code,
        body,
    )
    return False


async def link_reviewer_question_after_run(
    client: httpx.AsyncClient,
    thread_id: str,
    user_id: str | None,
    message_id: str | None,
    *,
    langgraph_base_url: str,
    langgraph_headers: dict[str, str],
) -> str | None:
    """
    Fetch thread state, extract question_id from current-turn upload tool,
    and PUT userId, messageId, threadId to desk (source is set only on create via reviewer MCP).
    Returns question_id when linked.
    """
    if not user_id or not message_id:
        logger.warning(
            "Skipping desk question link for thread %s: missing userId=%s messageId=%s",
            thread_id,
            user_id,
            message_id,
        )
        return None

    try:
        messages = await fetch_thread_messages(
            client,
            thread_id,
            langgraph_base_url=langgraph_base_url,
            langgraph_headers=langgraph_headers,
        )
    except httpx.HTTPError as exc:
        logger.warning(
            "Failed to fetch thread state for reviewer link (thread=%s): %s",
            thread_id,
            exc,
        )
        return None

    question_id = extract_question_id_from_messages(messages)
    if not question_id:
        logger.debug(
            "No upload_question_to_reviewer_system in current turn (thread=%s)",
            thread_id,
        )
        return None

    try:
        await update_desk_question(question_id, user_id, message_id, thread_id)
    except httpx.HTTPError as exc:
        logger.warning(
            "Desk link failed for question %s (thread=%s): %s",
            question_id,
            thread_id,
            exc,
        )
        return question_id

    return question_id

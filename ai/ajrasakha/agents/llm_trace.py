"""Structured LLM prompt / reasoning / output tracing for per-thread logs."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel

from ajrasakha.agents.thread_trace import trace_event

_MAX_MESSAGE_CHARS = 8000


def _message_content_to_str(message: BaseMessage) -> str:
    content = message.content
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts).strip()
    return str(content).strip()


def messages_to_trace(messages: list[BaseMessage]) -> list[dict[str, Any]]:
    """Serialize LangChain messages for thread logs (role + content)."""
    out: list[dict[str, str]] = []
    for idx, msg in enumerate(messages):
        if isinstance(msg, SystemMessage):
            role = "system"
        elif isinstance(msg, HumanMessage):
            role = "human"
        elif isinstance(msg, AIMessage):
            role = "assistant"
        else:
            role = type(msg).__name__
        text = _message_content_to_str(msg)
        if len(text) > _MAX_MESSAGE_CHARS:
            text = text[:_MAX_MESSAGE_CHARS] + f"\n... [{len(text) - _MAX_MESSAGE_CHARS} chars truncated]"
        out.append({"index": str(idx), "role": role, "content": text})
    return out


def _output_to_trace(output: Any) -> Any:
    if output is None:
        return None
    if isinstance(output, BaseModel):
        return output.model_dump()
    if isinstance(output, BaseMessage):
        return {
            "type": type(output).__name__,
            "content": _message_content_to_str(output),
        }
    if isinstance(output, dict):
        return output
    text = str(output).strip()
    if len(text) > _MAX_MESSAGE_CHARS:
        return text[:_MAX_MESSAGE_CHARS] + f"\n... [{len(text) - _MAX_MESSAGE_CHARS} chars truncated]"
    return text


def trace_llm_request(
    stage: str,
    *,
    model: str,
    messages: list[BaseMessage] | None = None,
    **extra: Any,
) -> None:
    """Log full LLM input: model + system/human messages (+ optional extras)."""
    payload: dict[str, Any] = {"model": model}
    if messages:
        payload["messages"] = messages_to_trace(messages)
    payload.update(extra)
    trace_event(f"llm_{stage}_request", **payload)


def trace_llm_response(
    stage: str,
    *,
    output: Any,
    reasoning: str | None = None,
    **extra: Any,
) -> None:
    """Log LLM output: reasoning (if any) + structured or text response."""
    payload: dict[str, Any] = {}
    if reasoning:
        payload["reasoning"] = reasoning
    traced = _output_to_trace(output)
    if traced is not None:
        payload["output"] = traced
    payload.update(extra)
    trace_event(f"llm_{stage}_response", **payload)


def trace_llm_error(stage: str, *, error: str, **extra: Any) -> None:
    trace_event(f"llm_{stage}_error", error=error, **extra)

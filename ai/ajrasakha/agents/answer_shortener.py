"""Final-answer integration with the AjraSakha answer-shortener service."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

import aiohttp
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.state import AjraSakhaState


logger = logging.getLogger(__name__)


class AnswerShortenerError(RuntimeError):
    """The shortener service could not provide a usable response."""


@dataclass(frozen=True)
class AnswerShortenerSettings:
    base_url: str
    api_key: str
    target_characters: int
    timeout_seconds: float


def _read_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise AnswerShortenerError(f"{name} must be an integer") from exc
    if value < 1:
        raise AnswerShortenerError(f"{name} must be positive")
    return value


def _read_positive_float(name: str, default: float) -> float:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = float(raw)
    except ValueError as exc:
        raise AnswerShortenerError(f"{name} must be a number") from exc
    if value <= 0:
        raise AnswerShortenerError(f"{name} must be positive")
    return value


def _shortener_settings() -> AnswerShortenerSettings | None:
    base_url = os.getenv("ANSWER_SHORTENER_BASE_URL", "").strip().rstrip("/")
    if not base_url:
        return None
    return AnswerShortenerSettings(
        base_url=base_url,
        api_key=os.getenv("ANSWER_SHORTENER_CLIENT_API_KEY", "").strip(),
        target_characters=_read_positive_int("ANSWER_SHORTENER_TARGET_CHARACTERS", 1500),
        timeout_seconds=_read_positive_float("ANSWER_SHORTENER_TIMEOUT_SECONDS", 15.0),
    )


def _message_text(message: BaseMessage) -> str:
    content = message.content
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and isinstance(block.get("text"), str):
                parts.append(block["text"])
        return " ".join(parts).strip()
    return str(content or "").strip()


def _last_human_query(messages: list[BaseMessage]) -> str:
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            return _message_text(message)
    return ""


def _last_farmer_answer(messages: list[BaseMessage]) -> str:
    for message in reversed(messages):
        if isinstance(message, AIMessage) and not getattr(message, "tool_calls", None):
            return _message_text(message)
    return ""


async def _request_shortening(
    settings: AnswerShortenerSettings,
    *,
    original_query: str,
    answer: str,
) -> dict[str, Any]:
    headers = {"X-API-Key": settings.api_key} if settings.api_key else {}
    payload = {
        "original_query": original_query,
        "answer": answer,
        "expected_character_count": settings.target_characters,
    }
    timeout = aiohttp.ClientTimeout(total=settings.timeout_seconds)
    url = f"{settings.base_url}/v1/answers/shorten"

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=payload, headers=headers) as response:
                if response.status != 200:
                    raise AnswerShortenerError(f"shortener returned HTTP {response.status}")
                data = await response.json(content_type=None)
    except (aiohttp.ClientError, TimeoutError) as exc:
        raise AnswerShortenerError("shortener request failed") from exc

    if not isinstance(data, dict) or not isinstance(data.get("short_answer"), str):
        raise AnswerShortenerError("shortener response is missing short_answer")
    return data


def _fallback(full_answer: str, status: str) -> dict[str, str]:
    return {
        "short_answer": full_answer,
        "full_answer": full_answer,
        "answer_shortening_status": status,
    }


async def answer_shortener_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict[str, str]:
    """Attach a source-only short answer without changing graph messages.

    The graph must remain usable if this optional downstream service is down,
    misconfigured, or cannot shorten a particular response. In every fallback,
    callers receive the original final answer in both fields.
    """

    del config  # Node behavior is configured through service environment values.
    messages = state.get("messages") or []
    full_answer = _last_farmer_answer(messages)
    if not full_answer:
        return _fallback("", "fallback_no_final_answer")

    original_query = _last_human_query(messages)
    if not original_query:
        return _fallback(full_answer, "fallback_no_original_query")

    try:
        settings = _shortener_settings()
        if settings is None:
            return _fallback(full_answer, "fallback_shortener_not_configured")
        response = await _request_shortening(
            settings,
            original_query=original_query,
            answer=full_answer,
        )
    except AnswerShortenerError as exc:
        logger.warning("answer shortener unavailable; returning full answer (%s)", exc)
        return _fallback(full_answer, "fallback_shortener_unavailable")
    except Exception:
        logger.exception("answer shortener failed unexpectedly; returning full answer")
        return _fallback(full_answer, "fallback_shortener_unavailable")

    return {
        "short_answer": response["short_answer"],
        "full_answer": full_answer,
        "answer_shortening_status": str(response.get("status") or "shortened"),
    }

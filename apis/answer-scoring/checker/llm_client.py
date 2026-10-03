"""MiniMax client with retries, shared by every model-based check."""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Callable

import requests
from dotenv import load_dotenv

import run_stats

logger = logging.getLogger(__name__)

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
MINIMAX_URL = "http://100.100.108.41:8001/v1/chat/completions"
MINIMAX_MODEL = "MiniMax-M3"
# The proxy often returns a cut-off response body (15-60% of calls, varies by
# day), so retry a lot with short waits. max_completion_tokens doesn't help
# and reasoning_split must stay on.
MAX_RETRIES = 9
RETRY_DELAYS_SECONDS = (1, 1, 2, 2, 3, 3, 3, 3, 3)

RETRYABLE_EXCEPTIONS = (
    requests.RequestException,
    json.JSONDecodeError,
    ValueError,
    KeyError,
    IndexError,
    TypeError,
)


class LLMCallFailed(Exception):
    """Raised once every retry attempt has been exhausted."""


def _extract_content(response: requests.Response) -> str:
    try:
        response_body = response.json()
        return response_body["choices"][0]["message"]["content"]
    except requests.exceptions.JSONDecodeError:
        # the proxy can cut off the reasoning field after a complete content
        # field, so pull the content out by hand
        content_match = re.search(r'"content":("(?:\\.|[^"\\])*")', response.text)
        if content_match is None:
            raise ValueError("MiniMax response envelope is invalid")
        return json.loads(content_match.group(1))


def api_key_is_set() -> bool:
    """Whether MINIMAX_API_KEY is set (never exposes the key)."""
    load_dotenv(PROJECT_DIRECTORY / ".env")
    return bool(os.getenv("MINIMAX_API_KEY", "").strip())


def call_llm_once(prompt: str, max_completion_tokens: int = 2048) -> str:
    """One request, returns the raw text. Raises on failure; use call_llm for retries."""
    load_dotenv(PROJECT_DIRECTORY / ".env")
    api_key = os.getenv("MINIMAX_API_KEY", "").strip()
    if not api_key:
        raise ValueError("MINIMAX_API_KEY is not configured")

    response = requests.post(
        MINIMAX_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": MINIMAX_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_completion_tokens": max_completion_tokens,
            "reasoning_split": True,
        },
        timeout=120,
    )
    response.raise_for_status()
    return _extract_content(response)


def call_llm(
    prompt: str,
    validate: Callable[[Any], bool],
    *,
    max_completion_tokens: int = 2048,
    max_retries: int = MAX_RETRIES,
    retry_delays: tuple[int, ...] = RETRY_DELAYS_SECONDS,
) -> dict[str, Any]:
    """Call the model with retries and return the parsed JSON.

    A response that fails `validate` is retried like an error. Raises
    LLMCallFailed when every attempt fails.
    """
    last_error: Exception | None = None
    run_stats.record(model_calls=1)
    for attempt in range(max_retries + 1):
        started = time.time()
        try:
            content = call_llm_once(prompt, max_completion_tokens=max_completion_tokens)
            match = re.search(r"{.*}", content, re.DOTALL)
            if match is None:
                raise ValueError("LLM response does not contain a JSON object")
            result = json.loads(match.group())
            if not validate(result):
                raise ValueError("LLM response does not match the required schema")
            run_stats.record(model_attempts=1, model_request_seconds=time.time() - started)
            return result
        except RETRYABLE_EXCEPTIONS as exc:
            last_error = exc
            run_stats.record(
                model_attempts=1, model_failed_attempts=1,
                model_request_seconds=time.time() - started,
            )
            if attempt == 0:
                # log only the first failure of each call
                logger.warning(
                    "model call attempt 1/%d failed, retrying: %s: %s",
                    max_retries + 1, type(exc).__name__, str(exc)[:200],
                )
            if attempt < max_retries:
                run_stats.record(model_sleep_seconds=retry_delays[attempt])
                time.sleep(retry_delays[attempt])
    run_stats.record(model_gave_up=1)
    raise LLMCallFailed(str(last_error))

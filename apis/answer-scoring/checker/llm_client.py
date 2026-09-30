"""Shared MiniMax-calling client.

One retry/backoff/parsing policy, used by every check that needs the LLM,
instead of each checker module reimplementing its own HTTP/retry/JSON
extraction logic (which is what happened before this module existed --
llm_checker.py and source_fidelity.py each had their own copy).
Adding a new LLM-based check should mean writing a prompt and a validator,
not a new HTTP client.
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any, Callable

import requests
from dotenv import load_dotenv

import run_stats


PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
MINIMAX_URL = "https://samagama.in/platform/proxy/v1/chat/completions"
MINIMAX_MODEL = "MiniMax-M3"
# The samagama.in proxy intermittently returns a truncated response body
# (valid HTTP 200, Content-Length matches what was sent, finish_reason
# "stop", but the JSON content is cut off mid-string). Measured empirically
# to affect a large fraction of individual calls (roughly 15-40% of
# attempts in a 16-call test at each of 1, 2, 4 and 8 workers), so a generous
# retry budget is needed for a reasonable chance of success. Every failure
# observed in that test was this same invalid-response-body error -- never a
# timeout, HTTP error or rate limit, and the rate did not climb with
# concurrency -- so waiting before a retry buys nothing: the next attempt is
# just another draw. The old 3/5/8/8/8-second waits were ~18% of a run's busy
# time. (Prompt size did not track failures in that test either, contrary to
# what was assumed earlier.)
#
# The failure rate is not fixed and is not specific to a prompt: measured at
# 15-40% on one day and ~60% on another, and even 7-character answers fail
# 30-60% of the time. Changing max_completion_tokens does not help, and
# dropping reasoning_split makes it far worse (21-23 of 24 fail). At a 60%
# failure rate, 5 retries leave ~6% of calls with no result; 9 leave ~0.6%.
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
        # The proxy can truncate MiniMax's separated reasoning field after
        # returning a complete content field. Recover only that JSON
        # string; genuinely incomplete content still fails json.loads later.
        content_match = re.search(r'"content":("(?:\\.|[^"\\])*")', response.text)
        if content_match is None:
            raise ValueError("MiniMax response envelope is invalid")
        return json.loads(content_match.group(1))


def call_llm_once(prompt: str, max_completion_tokens: int = 2048) -> str:
    """Send one chat-completions request and return its raw text content.

    Raises on any failure. Prefer `call_llm` for the shared retry policy.
    """
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
    """Call the LLM with the shared retry policy, returning one parsed and
    validated JSON object.

    `validate(parsed_dict) -> bool` decides whether a response is accepted;
    a False result is treated as a retryable failure, the same as a
    network error or malformed JSON. Raises `LLMCallFailed` once every
    attempt is exhausted.
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
            if attempt < max_retries:
                run_stats.record(model_sleep_seconds=retry_delays[attempt])
                time.sleep(retry_delays[attempt])
    run_stats.record(model_gave_up=1)
    raise LLMCallFailed(str(last_error))

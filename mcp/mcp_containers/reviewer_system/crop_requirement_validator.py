import asyncio
import os
import re

import requests

BASE_URL = os.getenv("BASE_URL")
MODEL = os.getenv("MODEL")

_CROP_CLASSIFICATION_SYSTEM_PROMPT = (
    "You classify agricultural farmer questions. Given a domain and question, "
    "decide whether a human expert must know the specific crop to answer correctly, "
    "and whether the answer would meaningfully differ across crops. "
    "Return exactly one word: crop_specific or general. No other text."
)


def _parse_crop_classification(raw_output: str) -> bool:
    """
    Parse LLM output.
    Returns True if crop-specific (crop required), False if general.
    Unknown values fail open to general (False).
    """
    cleaned = (raw_output or "").strip().lower()
    if not cleaned:
        return False

    if re.search(r"\bcrop[_\s-]?specific\b", cleaned) or cleaned in {
        "yes",
        "true",
        "1",
        "crop_specific",
    }:
        return True

    if re.search(r"\bgeneral\b", cleaned) or cleaned in {"no", "false", "0"}:
        return False

    return False


def _request_crop_classification(
    question: str,
    original_question: str,
    domain: str,
) -> str:
    if not BASE_URL:
        raise ValueError("BASE_URL is not configured.")
    if not MODEL:
        raise ValueError("MODEL is not configured.")

    url = f"{BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": MODEL.strip('"'),
        "messages": [
            {"role": "system", "content": _CROP_CLASSIFICATION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Domain: {domain}\n"
                    f"Question: {question}\n"
                    f"Original question: {original_question}\n\n"
                    "Return only crop_specific or general."
                ),
            },
        ],
        "max_tokens": 16,
        "temperature": 0.0,
        "top_p": 0.95,
    }

    response = requests.post(
        url,
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )
    response.raise_for_status()
    body = response.json()
    return body["choices"][0]["message"]["content"]


async def is_crop_specific_question(
    question: str,
    original_question: str,
    domain: str,
) -> bool:
    """
    Returns True if crop is required; False if general (crop=all ok).
    On LLM failure, fails open to False (general).
    """
    try:
        raw_output = await asyncio.to_thread(
            _request_crop_classification,
            question,
            original_question,
            domain,
        )
        return _parse_crop_classification(raw_output)
    except Exception as exc:
        print(
            f"Crop requirement validator failed (fail-open to general): {exc}",
            flush=True,
        )
        return False

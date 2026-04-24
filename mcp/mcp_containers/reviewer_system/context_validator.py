import asyncio
import os
import re
from typing import Any, List, Optional

import requests

BASE_URL = os.getenv("BASE_URL")
MODEL = os.getenv("MODEL")

_VALIDATION_SYSTEM_PROMPT = (
"""You are a strict relevance validator.
You will receive a user query and numbered context chunks.
Return only the single most relevant chunk number if one clear match exists.
Return multiple chunk numbers (comma-separated, e.g., 1,3,4) only if the query explicitly needs additional context from multiple chunks.
If no chunk is relevant, return exactly: null.
Do not return any other text."""
)


def _chunk_to_text(chunk: Any, idx: int) -> str:
    """Serialize a retrieved chunk to a compact numbered text block."""
    if hasattr(chunk, "model_dump"):
        data = chunk.model_dump()
    elif isinstance(chunk, dict):
        data = chunk
    else:
        data = {"value": str(chunk)}

    question = data.get("question_text", "")
    answer = data.get("answer_text", "")
    similarity_score = data.get("similarity_score", "")

    return (
        f"{idx}. question_text: {question}\n"
        f"answer_text: {answer}\n"
        f"similarity_score: {similarity_score}"
    )


def _parse_chunk_indices(raw_output: str, max_index: int) -> Optional[List[int]]:
    """Parse LLM output into deduplicated 1-based chunk indices."""
    cleaned = (raw_output or "").strip().lower()
    if not cleaned or cleaned == "null":
        return None

    numbers = re.findall(r"\d+", cleaned)
    if not numbers:
        return None

    seen = set()
    result: List[int] = []
    for num in numbers:
        idx = int(num)
        if 1 <= idx <= max_index and idx not in seen:
            seen.add(idx)
            result.append(idx)

    return result or None


def _request_validation_output(query: str, chunk_text: str) -> str:
    if not BASE_URL:
        raise ValueError("BASE_URL is not configured.")
    if not MODEL:
        raise ValueError("MODEL is not configured.")

    url = f"{BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": MODEL.strip('"'),
        "messages": [
            {"role": "system", "content": _VALIDATION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Query:\n{query}\n\n"
                    f"Context chunks:\n{chunk_text}\n\n"
                    "Return only chunk numbers or null."
                ),
            },
        ],
        "max_tokens": 32,
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


async def validate_retrieved_context(
    query: str,
    retrieved_chunks: List[Any],
) -> Optional[List[Any]]:
    """
    Validate retrieved chunks against query using LLM.
    Returns:
      - list of validated chunks if one or more matches exist
      - None if no relevant chunks are identified
    Raises:
      - Exception on validator call failures (caller should fallback)
    """
    if not retrieved_chunks:
        return None

    chunk_text = "\n\n".join(
        _chunk_to_text(chunk, idx + 1) for idx, chunk in enumerate(retrieved_chunks)
    )
    raw_output = await asyncio.to_thread(_request_validation_output, query, chunk_text)
    selected_indices = _parse_chunk_indices(raw_output, len(retrieved_chunks))

    if not selected_indices:
        return None

    return [retrieved_chunks[idx - 1] for idx in selected_indices]

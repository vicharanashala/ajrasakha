import asyncio
import json
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


_CLASSIFICATION_SYSTEM_PROMPT = """You classify database Q&A chunks against a user query.
You will receive a user query and numbered context chunks (question_text + answer_text).

Rules:
- SAME: question_text is identical to the query OR a clear paraphrase (same intent, same question).
  Pick at most ONE best chunk index for SAME.
- RELEVANT: question_text is NOT the same/paraphrase, but answer_text has enough information to answer the user query.
  You may list multiple chunk indices for RELEVANT.
- Ignore chunks that are neither SAME nor RELEVANT.

Respond with ONLY valid JSON, no markdown:
{"same": <chunk number or null>, "relevant": [<chunk numbers>]}
Use 1-based chunk numbers. Use null and [] when none apply."""


def _chunk_data(chunk: Any) -> dict:
    if hasattr(chunk, "model_dump"):
        return chunk.model_dump()
    if isinstance(chunk, dict):
        return chunk
    return {"value": str(chunk)}


def _request_classification_output(query: str, chunk_text: str) -> str:
    if not BASE_URL:
        raise ValueError("BASE_URL is not configured.")
    if not MODEL:
        raise ValueError("MODEL is not configured.")

    url = f"{BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": MODEL.strip('"'),
        "messages": [
            {"role": "system", "content": _CLASSIFICATION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Query:\n{query}\n\n"
                    f"Context chunks:\n{chunk_text}\n\n"
                    "Return JSON only."
                ),
            },
        ],
        "max_tokens": 64,
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


def _parse_classification_json(raw_output: str, max_index: int) -> dict[str, list[int]]:
    cleaned = (raw_output or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    same_indices: list[int] = []
    relevant_indices: list[int] = []

    try:
        parsed = json.loads(cleaned)
        same_val = parsed.get("same")
        if same_val is not None:
            if isinstance(same_val, int) and 1 <= same_val <= max_index:
                same_indices = [same_val]
            elif isinstance(same_val, list) and same_val:
                idx = int(same_val[0])
                if 1 <= idx <= max_index:
                    same_indices = [idx]

        for num in parsed.get("relevant") or []:
            idx = int(num)
            if 1 <= idx <= max_index and idx not in same_indices and idx not in relevant_indices:
                relevant_indices.append(idx)
    except (json.JSONDecodeError, TypeError, ValueError):
        # Fallback: treat first number as same, rest as relevant
        numbers = [int(n) for n in re.findall(r"\d+", cleaned)]
        if numbers and 1 <= numbers[0] <= max_index:
            same_indices = [numbers[0]]
            for n in numbers[1:]:
                if 1 <= n <= max_index and n not in same_indices and n not in relevant_indices:
                    relevant_indices.append(n)

    return {"same": same_indices, "relevant": relevant_indices}


async def classify_retrieved_chunks(
    query: str,
    retrieved_chunks: List[Any],
) -> dict[str, List[Any]]:
    """
    Classify chunks as same (duplicate/paraphrase) or relevant (answer helps).
    Returns {"same": [chunk], "relevant": [chunk, ...]}.
    """
    if not retrieved_chunks:
        return {"same": [], "relevant": []}

    chunk_text = "\n\n".join(
        _chunk_to_text(chunk, idx + 1) for idx, chunk in enumerate(retrieved_chunks)
    )
    raw_output = await asyncio.to_thread(_request_classification_output, query, chunk_text)
    indices = _parse_classification_json(raw_output, len(retrieved_chunks))

    same_list = [retrieved_chunks[i - 1] for i in indices["same"][:1]]
    relevant_list = [
        retrieved_chunks[i - 1] for i in indices["relevant"]
    ]
    return {"same": same_list, "relevant": relevant_list}


def build_reference_question_details(
    same_chunks: List[Any],
    relevant_chunks: List[Any],
) -> list[dict]:
    """Desk API referenceQuestionDetails: one duplicate ref max, multiple non-duplicate."""
    refs: list[dict] = []
    if same_chunks:
        data = _chunk_data(same_chunks[0])
        qid = data.get("question_id")
        if qid:
            refs.append({"_id": str(qid), "duplicate": True})
    for chunk in relevant_chunks:
        data = _chunk_data(chunk)
        qid = data.get("question_id")
        if qid:
            refs.append({"_id": str(qid), "duplicate": False})
    return refs

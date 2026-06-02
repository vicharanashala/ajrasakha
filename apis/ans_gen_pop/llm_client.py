from __future__ import annotations

import logging
import os
import re
from typing import List, Optional

import httpx

from models import ContextPOP, POPComplianceNotice

log = logging.getLogger("ans_gen_pop.llm")

LLM_API_URL = os.getenv("LLM_API_URL", "http://100.100.108.44:8013/v1/chat/completions")
LLM_MODEL = os.getenv("LLM_MODEL", "google/gemma-4-26B-A4B-it")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "60"))
LLM_MAX_TOKENS_FILTER = int(os.getenv("LLM_MAX_TOKENS_FILTER", "32"))
LLM_MAX_TOKENS_ANSWER = int(os.getenv("LLM_MAX_TOKENS_ANSWER", "1000"))
CHUNK_TEXT_MAX_CHARS = int(os.getenv("CHUNK_TEXT_MAX_CHARS", "1500"))

_FILTER_SYSTEM_PROMPT = """You are a strict relevance validator for Package of Practices (PoP) agricultural documents.
You will receive a user query and numbered context chunks from PoP records.
Return only comma-separated chunk numbers (e.g., 1,3) that contain information relevant to answering the query.
Return multiple chunk numbers only if the query explicitly needs information from multiple chunks.
If no chunk is relevant, return exactly: null
Do not return any other text."""

_GENERATION_SYSTEM_PROMPT = """You are an expert agricultural advisor for Indian farmers.
Generate a clear, practical answer using ONLY the provided Package of Practices (PoP) excerpts.
Rules:
- Do not use external knowledge or assumptions beyond the provided excerpts.
- If compliance notices indicate restricted or banned chemicals, follow those restrictions and do not recommend non-compliant products.
- Write in simple, farmer-friendly language in the same language as the user's query when possible.
- Provide a coherent answer in natural paragraphs (avoid unnecessary bullet lists).
- Do not append expert-review disclaimers, transfer-to-expert notices, or "ask again after 2 hours" messages."""

_EXPERT_DISCLAIMER_PATTERNS = [
    re.compile(
        r"^\s*#?\s*Your query has also been shared with an expert.*$",
        re.IGNORECASE | re.MULTILINE,
    ),
    re.compile(
        r"^\s*#?\s*We do not have sufficient information to answer your query.*$"
        r".*processed within 2 hours.*$",
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    ),
    re.compile(
        r"^\s*#?\s*We do not have sufficient information.*$"
        r".*transferred to an expert.*$",
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    ),
    re.compile(
        r"Please ask the same query after 2 hours\.?\s*",
        re.IGNORECASE,
    ),
    re.compile(
        r"It will be processed within 2 hours\.?\s*",
        re.IGNORECASE,
    ),
]


def strip_expert_disclaimer(text: str) -> str:
    """Remove AjraSakha agent expert-review / 2-hour footer lines from text."""
    if not text:
        return text
    cleaned = text
    for pattern in _EXPERT_DISCLAIMER_PATTERNS:
        cleaned = pattern.sub("", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _chat_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"
    return headers


def _base_payload(messages: list[dict], max_tokens: int) -> dict:
    payload: dict = {
        "model": LLM_MODEL.strip('"'),
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.0,
        "extra_body": {"chat_template_kwargs": {"enable_thinking": False}},
    }
    return payload


async def _chat_completion(messages: list[dict], max_tokens: int) -> str:
    async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
        response = await client.post(
            LLM_API_URL,
            headers=_chat_headers(),
            json=_base_payload(messages, max_tokens),
        )
        response.raise_for_status()
        body = response.json()
    choices = body.get("choices") or []
    if not choices:
        raise ValueError("LLM returned no choices")
    msg = choices[0].get("message") or {}
    content = msg.get("content") or msg.get("reasoning") or ""
    if not str(content).strip():
        raise ValueError("LLM returned empty content")
    return str(content).strip()


def _chunk_to_filter_text(chunk: ContextPOP, idx: int) -> str:
    meta = chunk.meta_data
    text = chunk.text or ""
    if len(text) > CHUNK_TEXT_MAX_CHARS:
        text = text[:CHUNK_TEXT_MAX_CHARS] + "..."
    return (
        f"{idx}. source_name: {meta.source_name or 'unknown'}\n"
        f"similarity_score: {meta.similarity_score}\n"
        f"text: {text}"
    )


def _parse_chunk_indices(raw_output: str, max_index: int) -> Optional[List[int]]:
    cleaned = (raw_output or "").strip().lower()
    if not cleaned or cleaned == "null":
        return None

    numbers = re.findall(r"\d+", cleaned)
    if not numbers:
        return None

    seen: set[int] = set()
    result: List[int] = []
    for num in numbers:
        idx = int(num)
        if 1 <= idx <= max_index and idx not in seen:
            seen.add(idx)
            result.append(idx)
    return result or None


async def filter_relevant_contexts(
    query: str, contexts: List[ContextPOP]
) -> Optional[List[ContextPOP]]:
    if not contexts:
        return None

    chunk_text = "\n\n".join(
        _chunk_to_filter_text(ctx, idx + 1) for idx, ctx in enumerate(contexts)
    )
    messages = [
        {"role": "system", "content": _FILTER_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Query:\n{query}\n\nContext chunks:\n{chunk_text}\n\n"
                "Return only chunk numbers or null."
            ),
        },
    ]
    raw_output = await _chat_completion(messages, LLM_MAX_TOKENS_FILTER)
    selected_indices = _parse_chunk_indices(raw_output, len(contexts))
    if not selected_indices:
        return None
    return [contexts[idx - 1] for idx in selected_indices]


def _format_contexts_for_generation(contexts: List[ContextPOP]) -> str:
    blocks: list[str] = []
    for idx, ctx in enumerate(contexts, start=1):
        meta = ctx.meta_data
        text = ctx.text or ""
        if len(text) > CHUNK_TEXT_MAX_CHARS:
            text = text[:CHUNK_TEXT_MAX_CHARS] + "..."
        blocks.append(
            f"[Excerpt {idx}]\n"
            f"Source: {meta.source_name or 'unknown'}\n"
            f"Link: {meta.source or 'N/A'}\n"
            f"Page: {meta.page_no}\n"
            f"Content:\n{text}"
        )
    return "\n\n".join(blocks)


def _format_compliance_notice(notice: Optional[POPComplianceNotice]) -> str:
    if not notice:
        return "None"
    parts = [notice.message]
    if notice.blocked_message:
        parts.append(notice.blocked_message)
    if notice.restricted_chemicals:
        parts.append(
            "Restricted chemicals: "
            + ", ".join(f.chemical_name for f in notice.restricted_chemicals)
        )
    if notice.blocked_non_restricted_chemicals:
        parts.append(
            "Blocked chemicals: " + ", ".join(notice.blocked_non_restricted_chemicals)
        )
    return "\n".join(parts)


async def generate_answer(
    query: str,
    state: str,
    crop: str,
    contexts: List[ContextPOP],
    compliance_notice: Optional[POPComplianceNotice],
) -> str:
    context_block = _format_contexts_for_generation(contexts)
    compliance_block = _format_compliance_notice(compliance_notice)
    messages = [
        {"role": "system", "content": _GENERATION_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"User query: {query}\n"
                f"State: {state}\n"
                f"Crop: {crop}\n\n"
                f"Compliance notice:\n{compliance_block}\n\n"
                f"PoP excerpts:\n{context_block}\n\n"
                "Generate the answer using only the excerpts above."
            ),
        },
    ]
    raw_answer = await _chat_completion(messages, LLM_MAX_TOKENS_ANSWER)
    return strip_expert_disclaimer(raw_answer)

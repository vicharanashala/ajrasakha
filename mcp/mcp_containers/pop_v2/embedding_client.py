"""Async client for the hosted embedding API."""
from __future__ import annotations

import time
from typing import List

import aiohttp

from constants import EMBEDDING_API_URL
from logging_config import get_logger

logger = get_logger("embedding")


def _extract_embedding(payload: dict) -> list | None:
    if not isinstance(payload, dict):
        return None
    embedding = payload.get("embedding")
    if isinstance(embedding, list) and embedding:
        return embedding
    embeddings = payload.get("embeddings")
    if isinstance(embeddings, list) and embeddings:
        first = embeddings[0]
        if isinstance(first, list):
            return first
        if isinstance(first, dict) and isinstance(first.get("embedding"), list):
            return first["embedding"]
    data = payload.get("data")
    if isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict) and isinstance(first.get("embedding"), list):
            return first["embedding"]
    return None


async def get_query_embedding(query: str) -> List[float]:
    preview = (query or "")[:80]
    logger.info("embedding request text_preview=%r url=%s", preview, EMBEDDING_API_URL)
    started = time.perf_counter()
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            EMBEDDING_API_URL,
            json={"text": query},
            headers={"Content-Type": "application/json"},
        ) as response:
            response.raise_for_status()
            payload = await response.json()

    embedding = _extract_embedding(payload)
    if not embedding:
        logger.error(
            "invalid embedding response keys=%s",
            list(payload.keys()) if isinstance(payload, dict) else type(payload),
        )
        raise ValueError("Embedding API returned invalid 'embedding' payload")
    elapsed_ms = (time.perf_counter() - started) * 1000
    logger.info("embedding ok dim=%d elapsed_ms=%.1f", len(embedding), elapsed_ms)
    return embedding

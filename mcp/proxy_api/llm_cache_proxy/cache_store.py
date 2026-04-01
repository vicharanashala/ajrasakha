"""
Redis-backed cache store with embedding similarity search.

Caches the LLM's final text response (not raw tool output).

Storage layout in Redis:
  - Key: "response_cache:{state_lower}:{crop_lower}" (a Redis Hash)
  - Each field in the hash is a UUID entry ID.
  - Each value is a JSON blob: {"embedding": [...], "result": ..., "ts": epoch}
  
We also set a TTL on the entire hash key so stale buckets auto-expire.
"""
import json
import time
import uuid
from typing import Any, Optional, Tuple, List

import numpy as np
import redis.asyncio as redis

from config import REDIS_URL, SIMILARITY_THRESHOLD, CACHE_TTL_SECONDS, logger


_redis_pool: Optional[redis.Redis] = None


async def get_redis() -> redis.Redis:
    """Get or create the async Redis connection."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_pool


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def build_bucket_key(state: Optional[str], crop: Optional[str], lang: str = "english") -> str:
    """
    Build the Redis bucket key from state, crop, and language.
    All are lowercased and spaces removed for case/space-insensitive matching.
    Language ensures each language gets its own cache bucket.
    """
    s = (state or "").replace(" ", "").lower()
    c = (crop or "").replace(" ", "").lower()
    l = (lang or "english").replace(" ", "").lower()
    return f"response_cache:{s}:{c}:{l}"


async def get_cached_result(
    bucket_key: str, query_embedding: List[float]
) -> Optional[Tuple[Any, float]]:
    """
    Search the bucket for a cached entry whose embedding is similar
    enough to query_embedding (above SIMILARITY_THRESHOLD).
    
    Returns (cached_result, similarity_score) or None.
    """
    r = await get_redis()
    entries = await r.hgetall(bucket_key)

    if not entries:
        return None

    best_score = -1.0
    best_result = None

    for _entry_id, entry_json in entries.items():
        try:
            entry = json.loads(entry_json)
        except json.JSONDecodeError:
            continue

        stored_embedding = entry.get("embedding")
        if not stored_embedding:
            continue

        score = cosine_similarity(query_embedding, stored_embedding)
        if score > best_score:
            best_score = score
            best_result = entry.get("result")

    if best_score >= SIMILARITY_THRESHOLD and best_result is not None:
        logger.info(
            f"CACHE HIT — bucket={bucket_key}, similarity={best_score:.4f}"
        )
        return best_result, best_score

    logger.info(
        f"CACHE MISS — bucket={bucket_key}, best_similarity={best_score:.4f} "
        f"(threshold={SIMILARITY_THRESHOLD})"
    )
    return None


async def store_result(
    bucket_key: str, query_embedding: List[float], result: Any
) -> None:
    """
    Store an embedding + result in the bucket hash, and refresh the TTL.
    """
    r = await get_redis()
    entry_id = str(uuid.uuid4())
    entry = {
        "embedding": query_embedding,
        "result": result,
        "ts": time.time(),
    }
    await r.hset(bucket_key, entry_id, json.dumps(entry))
    await r.expire(bucket_key, CACHE_TTL_SECONDS)
    logger.info(f"CACHE STORE — bucket={bucket_key}, entry_id={entry_id}")


async def close_redis() -> None:
    """Close the Redis connection pool."""
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.aclose()
        _redis_pool = None

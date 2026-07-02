"""POP retrieval via MongoDB Atlas $vectorSearch on chunks.embedding_vector."""
from __future__ import annotations

import re
import time
from typing import List, Set

import numpy as np
import pymongo
from pydantic import BaseModel

from constants import (
    MONGODB_URI,
    POP_MONGODB_COLLECTION,
    POP_MONGODB_DATABASE,
    POP_SIMILARITY_THRESHOLD,
    POP_TOP_K,
    POP_VECTOR_INDEX_NAME,
    POP_VECTOR_NUM_CANDIDATES,
    POP_VECTOR_SEARCH_LIMIT,
)
from logging_config import get_logger

logger = get_logger("retrieval")

_mongo_client: pymongo.MongoClient | None = None


class POPChunkResult(BaseModel):
    doc_id: str
    doc_name: str
    doc_link: str | None
    doc_origin: str
    chunk_id: str
    chunk_content: str
    page_no: int | None
    similarity_score: float
    verified_by: str | None


def _normalize(text: str) -> str:
    text = (text or "").lower()
    text = text.replace("&", "and")
    text = text.replace("_", " ")
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _get_collection():
    global _mongo_client
    if _mongo_client is None:
        logger.info(
            "connecting mongo db=%s collection=%s index=%s",
            POP_MONGODB_DATABASE,
            POP_MONGODB_COLLECTION,
            POP_VECTOR_INDEX_NAME,
        )
        _mongo_client = pymongo.MongoClient(
            MONGODB_URI, tlsAllowInvalidCertificates=True
        )
    return _mongo_client[POP_MONGODB_DATABASE][POP_MONGODB_COLLECTION]


def _get_verified_by(doc_usage: list, state: str, crop: str) -> str | None:
    state_n = _normalize(state)
    crop_n = _normalize(crop)
    for entry in doc_usage or []:
        if (
            _normalize(entry.get("state")) == state_n
            and _normalize(entry.get("crop")) == crop_n
        ):
            return entry.get("verified_by")
    return None


def _resolve_doc_link(document: dict, doc_usage: list, state: str, crop: str) -> str | None:
    for key in ("doc_link", "unique_links", "doc_links"):
        value = document.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list) and value:
            first = value[0]
            if isinstance(first, str) and first.strip():
                return first.strip()

    state_n = _normalize(state)
    crop_n = _normalize(crop)
    for entry in doc_usage or []:
        if (
            _normalize(entry.get("state")) == state_n
            and _normalize(entry.get("crop")) == crop_n
        ):
            link = entry.get("doc_link")
            if isinstance(link, str) and link.strip():
                return link.strip()
    return None


def _doc_origin_matches_state(doc_origin: str, state_n: str) -> bool:
    origin_n = _normalize(doc_origin)
    if not origin_n or not state_n:
        return False
    if origin_n == state_n:
        return True
    return state_n in origin_n or origin_n in state_n


def _doc_origin_is_central(doc_origin: str) -> bool:
    return _normalize(doc_origin) == "central"


def _classify_origin_case(doc_origin: str, state_n: str) -> int:
    """Return 1=state, 2=central, 3=other (lower = higher priority)."""
    if _doc_origin_matches_state(doc_origin, state_n):
        return 1
    if _doc_origin_is_central(doc_origin):
        return 2
    return 3


def _pick_best_chunk(
    chunks: list, query_embedding: list, doc_score: float
) -> tuple[dict | None, float]:
    if not chunks:
        return None, doc_score

    query = np.asarray(query_embedding, dtype=np.float32).reshape(-1)
    query_norm = np.linalg.norm(query)
    if query_norm == 0:
        return chunks[0], doc_score

    best_chunk: dict | None = None
    best_score = -1.0
    for chunk in chunks:
        emb = chunk.get("embedding_vector")
        if not emb:
            continue
        vec = np.asarray(emb, dtype=np.float32).reshape(-1)
        denom = query_norm * np.linalg.norm(vec)
        if denom == 0:
            continue
        score = float(np.dot(query, vec) / denom)
        if score > best_score:
            best_score = score
            best_chunk = chunk

    if best_chunk is None:
        return chunks[0], doc_score
    return best_chunk, max(best_score, doc_score)


def _doc_to_result(
    row: dict,
    best_chunk: dict,
    score: float,
    state: str,
    crop: str,
) -> POPChunkResult:
    document = row.get("document") or {}
    doc_usage = document.get("doc_usage") or []
    return POPChunkResult(
        doc_id=str(document.get("doc_id", "")),
        doc_name=str(document.get("doc_name", "")),
        doc_link=_resolve_doc_link(document, doc_usage, state, crop),
        doc_origin=str(document.get("doc_origin") or ""),
        chunk_id=str(best_chunk.get("chunk_id", "")),
        chunk_content=str(best_chunk.get("chunk_content", "")),
        page_no=best_chunk.get("page_no"),
        similarity_score=score,
        verified_by=_get_verified_by(doc_usage, state, crop),
    )


def _vector_search(
    query_embedding: list,
    state: str,
    crop: str,
) -> list[dict]:
    """Single Atlas vector search; state/crop via index filters (exact eq only)."""
    vs_stage = {
        "index": POP_VECTOR_INDEX_NAME,
        "path": "chunks.embedding_vector",
        "queryVector": query_embedding,
        "numCandidates": POP_VECTOR_NUM_CANDIDATES,
        "limit": POP_VECTOR_SEARCH_LIMIT,
        "filter": {
            "document.doc_usage.state": state,
            "document.doc_usage.crop": crop,
        },
    }
    pipeline = [
        {"$vectorSearch": vs_stage},
        {"$set": {"score": {"$meta": "vectorSearchScore"}}},
        {"$project": {"document": 1, "chunks": 1, "score": 1}},
    ]
    started = time.perf_counter()
    rows = list(_get_collection().aggregate(pipeline))
    logger.info(
        "vector_search hits=%d fetch_ms=%.1f",
        len(rows),
        (time.perf_counter() - started) * 1000,
    )
    return rows


def retrieve_pop_contexts(
    query_embedding: list,
    state: str,
    crop: str,
) -> List[POPChunkResult]:
    state_n = _normalize(state)
    logger.info(
        "retrieve start state=%r crop=%r index=%s threshold=%.2f top_k=%d",
        state,
        crop,
        POP_VECTOR_INDEX_NAME,
        POP_SIMILARITY_THRESHOLD,
        POP_TOP_K,
    )
    started = time.perf_counter()

    rows = _vector_search(query_embedding, state, crop)

    # Build candidates: (case_priority, score, result) per doc_id
    candidates: list[tuple[int, float, POPChunkResult]] = []
    seen_doc_ids: Set[str] = set()

    for row in rows:
        doc_score = float(row.get("score") or 0.0)
        if doc_score < POP_SIMILARITY_THRESHOLD:
            continue

        document = row.get("document") or {}
        doc_id = str(document.get("doc_id", ""))
        if not doc_id or doc_id in seen_doc_ids:
            continue

        best_chunk, chunk_score = _pick_best_chunk(
            row.get("chunks") or [], query_embedding, doc_score
        )
        if best_chunk is None or chunk_score < POP_SIMILARITY_THRESHOLD:
            continue

        doc_origin = str(document.get("doc_origin") or "")
        case_priority = _classify_origin_case(doc_origin, state_n)
        result = _doc_to_result(row, best_chunk, chunk_score, state, crop)
        candidates.append((case_priority, chunk_score, result))
        seen_doc_ids.add(doc_id)

    # Sort: case 1 first, then 2, then 3; within case by score desc
    candidates.sort(key=lambda item: (item[0], -item[1]))

    collected: List[POPChunkResult] = []
    final_seen: Set[str] = set()
    for _case_priority, _score, result in candidates:
        if result.doc_id in final_seen:
            continue
        collected.append(result)
        final_seen.add(result.doc_id)
        if len(collected) >= POP_TOP_K:
            break

    elapsed_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "retrieve done total_docs=%d elapsed_ms=%.1f doc_ids=%s",
        len(collected),
        elapsed_ms,
        [r.doc_id for r in collected],
    )
    return collected

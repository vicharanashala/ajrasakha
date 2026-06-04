import os
import asyncio
import json
import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional
from mcp.server.fastmcp import FastMCP

import httpx
from bson import ObjectId
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel
from pymongo import AsyncMongoClient
from dotenv import load_dotenv

load_dotenv()

IST = timezone(timedelta(hours=5, minutes=30))


class ISTFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, IST)
        return dt.strftime(datefmt or "%Y-%m-%d %H:%M:%S") + " IST"


_log_handler = logging.StreamHandler()
_log_handler.setFormatter(ISTFormatter("%(asctime)s %(levelname)s [golden-mcp] %(message)s"))
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, handlers=[_log_handler])
log = logging.getLogger(__name__)

EMBEDDING_ENDPOINT = os.getenv("GOLDEN_EMBEDDING_ENDPOINT", "http://100.100.108.43:6001/embed")
EMBEDDING_TIMEOUT_S = float(os.getenv("GOLDEN_EMBEDDING_TIMEOUT_S", "15"))
MONGODB_URI = os.getenv("GOLDEN_MONGODB_URI")
MONGODB_DATABASE = os.getenv("GOLDEN_MONGODB_DATABASE", "agriai")
MONGODB_COLLECTION = os.getenv("GOLDEN_MONGODB_COLLECTION", "questions")
MONGODB_VECTOR_INDEX = os.getenv("GOLDEN_MONGODB_INDEX")
MONGODB_SEARCH_INDEX = os.getenv("GOLDEN_MONGODB_SEARCH_INDEX", "review_questions_search_index")
if not MONGODB_URI:
    raise RuntimeError("GOLDEN_MONGODB_URI is not set")
if not MONGODB_VECTOR_INDEX:
    raise RuntimeError("GOLDEN_MONGODB_INDEX is not set")
if not MONGODB_SEARCH_INDEX:
    raise RuntimeError("GOLDEN_MONGODB_SEARCH_INDEX is not set")

mongo_client = AsyncMongoClient(MONGODB_URI)
database = mongo_client[MONGODB_DATABASE]
answers_collection = database["answers"]
users_collection = database["users"]
questions_collection = database["questions"]

mcp = FastMCP(
    "ajrasakha-golden-mcp",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    )
)

# Sigmoid maps raw Atlas BM25 searchScore (~1–20+) into (0, 1) for audit/thresholds.
ATLAS_SCORE_SIGMOID_CENTER = 5.0
ATLAS_SCORE_SIGMOID_SCALE = 2.0
GDB_ATLAS_TOP_K = 2
GDB_VECTOR_TOP_K = 3
GDB_MERGED_MAX_PAIRS = 5
RETRIEVAL_SOURCE_ATLAS = "atlas"
RETRIEVAL_SOURCE_RAG = "rag"
RETRIEVAL_SOURCE_STRICT_EXACT = "strict_exact"


def _normalize_atlas_search_score(score: float | None) -> float | None:
    if score is None:
        return None
    return 1.0 / (1.0 + math.exp(-(score - ATLAS_SCORE_SIGMOID_CENTER) / ATLAS_SCORE_SIGMOID_SCALE))


def _truncate_text(text: str | None, max_len: int = 100) -> str:
    s = (text or "").replace("\n", " ").strip()
    if len(s) <= max_len:
        return s
    return s[:max_len] + "..."


def _log_search_hits(
    path: str,
    query: str,
    crop: str,
    state: str,
    pairs: list["QuestionAnswerPair"],
    *,
    raw_scores: list[float | None] | None = None,
) -> None:
    if not pairs:
        log.info(
            "%s: no hits query=%r crop=%s state=%s",
            path,
            _truncate_text(query, 80),
            crop,
            state,
        )
        return
    for i, pair in enumerate(pairs, 1):
        extra = ""
        if raw_scores and i - 1 < len(raw_scores) and raw_scores[i - 1] is not None:
            raw = raw_scores[i - 1]
            extra = f" raw_atlas={raw:.4f}"
        log.info(
            "%s[%d]: question_id=%s similarity_score=%s%s question=%r",
            path,
            i,
            pair.question_id,
            f"{pair.similarity_score:.4f}" if pair.similarity_score is not None else "n/a",
            extra,
            _truncate_text(pair.question_text, 80),
        )


class QuestionAnswerPair(BaseModel):
    question_id: str
    question_text: str
    answer_text: str
    author: Optional[str]
    sources: List
    similarity_score: Optional[float] = None


def _normalize_crop_state(crop: str, state: str) -> tuple[str, str]:
    """Require crop and state; use 'all' only when a value is missing after trim."""
    crop = (crop or "").strip() or "all"
    state = (state or "").strip() or "all"
    return crop, state


def _author_display_name(user_document: dict | None) -> Optional[str]:
    """Full expert name: name field, else firstName + lastName."""
    if not user_document:
        return None
    name = (user_document.get("name") or "").strip()
    if name:
        return name
    first = (user_document.get("firstName") or "").strip()
    last = (user_document.get("lastName") or "").strip()
    full = " ".join(part for part in (first, last) if part)
    return full or None


async def _embed_text(text: str) -> list[float]:
    payload = {"text": text}
    timeout = httpx.Timeout(EMBEDDING_TIMEOUT_S)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            EMBEDDING_ENDPOINT,
            headers={"Content-Type": "application/json"},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
    embedding = data.get("embedding")
    if not isinstance(embedding, list) or not embedding:
        raise ValueError("Embedding endpoint returned invalid 'embedding'")
    return embedding


async def _vector_search_questions(
    *,
    query_vector: list[float],
    k: int,
    meta_filter: dict[str, Any],
) -> list[dict[str, Any]]:
    pipeline: list[dict[str, Any]] = [
        {
            "$vectorSearch": {
                "index": MONGODB_VECTOR_INDEX,
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": max(50, k * 10),
                "limit": k,
                "filter": meta_filter,
            }
        },
        {
            "$project": {
                "_id": 1,
                "question": 1,
                "text": 1,
                "details": 1,
                "vector_score": {"$meta": "vectorSearchScore"},
            }
        },
    ]
    cursor = await questions_collection.aggregate(pipeline)
    return await cursor.to_list(length=k)


async def _get_answer_text_sources_and_author_name(question_id: str):
    answer_document = await answers_collection.find_one(
        {
            "questionId": ObjectId(question_id),
            "isFinalAnswer": True,
        },
        {
            "sources": 1,
            "authorId": 1,
            "answer": 1,
        },
    )
    if not answer_document:
        return None, [], None

    author_name = None
    author_id = answer_document.get("authorId")
    if author_id:
        user_document = await users_collection.find_one(
            {"_id": ObjectId(author_id)},
            {"firstName": 1, "lastName": 1, "name": 1},
        )
        author_name = _author_display_name(user_document)

    sources = answer_document.get("sources")
    answer = answer_document.get("answer")

    return answer, sources, author_name


@mcp.tool()
async def golden_retriever_tool(
        query: str,
        crop: str,
        state: str,
        season: str | None = None,
        domain: str | None = None,
) -> list:
    """Retrieve relevant documents from the Golden dataset.

    crop and state are required on every call. Use the farmer's crop and state when known;
    use crop='all' or state='all' only as a last resort when that dimension is unknown.
    """
    crop, state = _normalize_crop_state(crop, state)
    filters = {
        "status": "closed",
    }
    if crop != "all":
        filters["details.crop"] = crop
    if state != "all":
        filters["details.state"] = state

    if season:
        filters["details.season"] = season
    if domain:
        filters["details.domain"] = domain

    log.info(
        "vector search start query=%r crop=%s state=%s endpoint=%s",
        _truncate_text(query, 80),
        crop,
        state,
        EMBEDDING_ENDPOINT,
    )
    try:
        query_vector = await _embed_text(query)
        docs = await _vector_search_questions(
            query_vector=query_vector, k=5, meta_filter=filters
        )
    except Exception as exc:
        log.warning(
            "vector search failed (atlas-only fallback): %s: %s",
            type(exc).__name__,
            exc,
        )
        return []

    log.info("vector search mongo returned %d doc(s)", len(docs))
    result = []
    for doc in docs:
        score = doc.get("vector_score")
        question_id = str(doc["_id"])
        answer, sources, author_name = await _get_answer_text_sources_and_author_name(
            question_id
        )
        if not answer:
            continue
        question_answer_pair = QuestionAnswerPair(
            question_id=question_id,
            question_text=doc.get("question") or doc.get("text", ""),
            answer_text=answer,
            author=author_name,
            sources=sources,
            similarity_score=score,
        )
        result.append(question_answer_pair)
    _log_search_hits("vector", query, crop, state, result)
    return result


@mcp.tool()
async def get_available_states() -> dict:
    """Get all unique states available in the Golden dataset."""
    states = await questions_collection.distinct("details.state", {"status": "closed"})
    return {"success": True, "states": sorted([s for s in states if s])}


@mcp.tool()
async def get_available_crops(state: str | None = None) -> dict:
    """
    Get all unique crops available in the Golden dataset.
    Optionally filter by state to get crops specific to that state.
    """
    filters = {"status": "closed"}
    if state:
        filters["details.state"] = state
    crops = await questions_collection.distinct("details.crop", filters)
    return {"success": True, "crops": sorted([c for c in crops if c])}


@mcp.tool()
async def get_available_domains(state: str | None = None, crop: str | None = None) -> dict:
    """
    Get all unique domains (e.g. pest management, irrigation, soil health) in the Golden dataset.
    Optionally filter by state and/or crop.
    """
    filters = {"status": "closed"}
    if state:
        filters["details.state"] = state
    if crop:
        filters["details.crop"] = crop
    domains = await questions_collection.distinct("details.domain", filters)
    return {"success": True, "domains": sorted([d for d in domains if d])}


@mcp.tool()
async def get_available_seasons(state: str | None = None, crop: str | None = None) -> dict:
    """
    Get all unique seasons (e.g. Kharif, Rabi, Zaid) in the Golden dataset.
    Optionally filter by state and/or crop.
    """
    filters = {"status": "closed"}
    if state:
        filters["details.state"] = state
    if crop:
        filters["details.crop"] = crop
    seasons = await questions_collection.distinct("details.season", filters)
    return {"success": True, "seasons": sorted([s for s in seasons if s])}


@mcp.tool()
async def golden_strict_exact_search_tool(
        query: str,
        crop: str,
        state: str,
) -> list:
    """
    Search the Golden dataset for a strict character-by-character exact match on 'question'
    or 'text' fields after applying strict state and crop filters only.

    crop and state are required.
    """
    crop, state = _normalize_crop_state(crop, state)
    log.info(
        "strict exact search start query=%r crop=%s state=%s",
        _truncate_text(query, 80),
        crop,
        state,
    )
    meta_filter: dict = {
        "status": "closed",
    }
    if crop != "all":
        meta_filter["details.crop"] = crop
    if state != "all":
        meta_filter["details.state"] = state

    pipeline = [
        {
            "$search": {
                "index": MONGODB_SEARCH_INDEX,
                "text": {
                    "query": query,
                    "path": ["question", "text"],
                },
            }
        },
        {
            "$match": meta_filter
        },
        {"$limit": 10},
        {
            "$project": {
                "_id": 1,
                "question": 1,
                "text": 1,
            }
        },
    ]

    cursor = await questions_collection.aggregate(pipeline)
    raw_results = await cursor.to_list(length=10)
    log.info("strict exact: atlas candidates=%d", len(raw_results))

    if not raw_results:
        log.info("strict exact: no atlas candidates")
        return []

    import string
    import re
    def normalize(t: str) -> str:
        return re.sub(r'\s+', ' ', t.translate(str.maketrans('', '', string.punctuation)).lower()).strip()

    norm_query = normalize(query)

    result = []
    for doc in raw_results:
        if normalize(doc.get("question") or doc.get("text", "")) == norm_query:
            question_id = str(doc["_id"])
            try:
                answer, sources, author_name = await _get_answer_text_sources_and_author_name(
                    question_id
                )
            except Exception:
                continue
            if not answer:
                continue

            question_answer_pair = QuestionAnswerPair(
                question_id=question_id,
                question_text=doc.get("question") or doc.get("text", ""),
                answer_text=answer,
                author=author_name,
                sources=sources,
            )
            result.append(question_answer_pair)
            log.info(
                "strict exact: match question_id=%s question=%r",
                question_id,
                _truncate_text(question_answer_pair.question_text, 80),
            )
            break  # Return only the first matching exact pair

    if not result:
        log.info("strict exact: no normalized-text match among %d candidate(s)", len(raw_results))
    return result


@mcp.tool()
async def golden_exact_search_tool(
        query: str,
        crop: str,
        state: str,
        season: str | None = None,
        domain: str | None = None,
        min_score: float = 1.0,
) -> list:
    """
    Search the Golden dataset using full-text keyword matching on the 'question'
    and 'text' fields via MongoDB Atlas Search ($search).

    crop and state are required metadata filters on every search.

    Args:
        query:     The user's question or keywords to match.
        crop:      Required crop filter (e.g. "Wheat", "Rice", or "all" as last resort).
        state:     Required state filter (e.g. "Punjab", "Maharashtra", or "all" as last resort).
        season:    Optional season filter (e.g. "Kharif", "Rabi").
        domain:    Optional domain filter (e.g. "pest management").
        min_score: Minimum Atlas Search relevance score to include a result.
    """
    crop, state = _normalize_crop_state(crop, state)
    meta_filter: dict = {
        "status": "closed",
    }
    if crop != "all":
        meta_filter["details.crop"] = crop
    if state != "all":
        meta_filter["details.state"] = state

    if season:
        meta_filter["details.season"] = season
    if domain:
        meta_filter["details.domain"] = domain

    log.info(
        "atlas keyword search start query=%r crop=%s state=%s min_score=%.2f season=%s domain=%s",
        _truncate_text(query, 80),
        crop,
        state,
        min_score,
        season or "-",
        domain or "-",
    )

    pipeline = [
        # Step 1: Atlas full-text search on question + text fields only
        {
            "$search": {
                "index": MONGODB_SEARCH_INDEX,
                "text": {
                    "query": query,
                    "path": ["question", "text"],  # search both fields
                },
            }
        },
        # Step 2: Inject the Atlas Search relevance score as a real field
        {
            "$addFields": {
                "search_score": {"$meta": "searchScore"},
            }
        },
        # Step 3: Apply metadata filters (crop/season/state/domain/status)
        {
            "$match": meta_filter
        },
        # Step 4: Only keep results with a meaningful keyword match score
        {
            "$match": {"search_score": {"$gte": min_score}}
        },
        # Step 5: Return top 5 best-matching documents
        {"$sort": {"search_score": -1}},
        {"$limit": 5},
        {
            "$project": {
                "_id": 1,
                "question": 1,
                "text": 1,
                "details": 1,
                "search_score": 1,
            }
        },
    ]
    cursor = await questions_collection.aggregate(pipeline)
    raw_results = await cursor.to_list(length=5)
    log.info("atlas keyword: mongo returned %d doc(s) after min_score filter", len(raw_results))

    if not raw_results:
        log.info("atlas keyword: no hits")
        return []

    result = []
    raw_scores: list[float | None] = []
    for doc in raw_results:
        question_id = str(doc["_id"])
        raw_score = doc.get("search_score")
        try:
            answer, sources, author_name = await _get_answer_text_sources_and_author_name(
                question_id
            )
        except Exception:
            log.warning(
                "atlas keyword: skip question_id=%s (answer lookup failed)",
                question_id,
            )
            continue
        if not answer:
            log.warning(
                "atlas keyword: skip question_id=%s raw_score=%s (no final answer)",
                question_id,
                raw_score,
            )
            continue

        norm_score = _normalize_atlas_search_score(raw_score)
        question_answer_pair = QuestionAnswerPair(
            question_id=question_id,
            question_text=doc.get("question") or doc.get("text", ""),
            answer_text=answer,
            author=author_name,
            sources=sources,
            similarity_score=norm_score,
        )
        result.append(question_answer_pair)
        raw_scores.append(raw_score)

    _log_search_hits("atlas", query, crop, state, result, raw_scores=raw_scores)
    return result


def _similar_pair_entry(pair: QuestionAnswerPair, retrieval_source: str) -> dict:
    return {
        "question_id": pair.question_id or "",
        "similarity_score": pair.similarity_score,
        "retrieval_source": retrieval_source,
        "question": pair.question_text,
        "answer": pair.answer_text,
        "details": _parse_sources(pair.sources, pair.author),
    }


def _build_merged_similar_match(
    atlas_pairs: list[QuestionAnswerPair],
    vector_pairs: list[QuestionAnswerPair],
) -> dict:
    """Merge atlas + RAG hits: priority slots, dedupe by question_id, backfill to GDB_MERGED_MAX_PAIRS."""
    similar_match: dict = {}
    seen_ids: set[str] = set()
    slot = 1
    atlas_priority_used = 0
    vector_priority_used = 0
    atlas_backfill_used = 0
    vector_backfill_used = 0
    dedup_skipped = 0

    def _append(pair: QuestionAnswerPair, retrieval_source: str) -> bool:
        nonlocal slot, dedup_skipped
        if slot > GDB_MERGED_MAX_PAIRS:
            return False
        qid = pair.question_id or ""
        if not qid:
            return False
        if qid in seen_ids:
            dedup_skipped += 1
            log.info(
                "merge: skip duplicate question_id=%s (wanted source=%s)",
                qid,
                retrieval_source,
            )
            return False
        seen_ids.add(qid)
        similar_match[f"similar_pair{slot}"] = _similar_pair_entry(pair, retrieval_source)
        log.info(
            "merge: similar_pair%d retrieval_source=%s question_id=%s similarity_score=%s",
            slot,
            retrieval_source,
            qid,
            f"{pair.similarity_score:.4f}" if pair.similarity_score is not None else "n/a",
        )
        slot += 1
        return True

    atlas_i = 0
    while atlas_i < len(atlas_pairs) and atlas_priority_used < GDB_ATLAS_TOP_K:
        if _append(atlas_pairs[atlas_i], RETRIEVAL_SOURCE_ATLAS):
            atlas_priority_used += 1
        atlas_i += 1

    vector_i = 0
    while vector_i < len(vector_pairs) and vector_priority_used < GDB_VECTOR_TOP_K:
        if _append(vector_pairs[vector_i], RETRIEVAL_SOURCE_RAG):
            vector_priority_used += 1
        vector_i += 1

    while atlas_i < len(atlas_pairs) and slot <= GDB_MERGED_MAX_PAIRS:
        if _append(atlas_pairs[atlas_i], RETRIEVAL_SOURCE_ATLAS):
            atlas_backfill_used += 1
        atlas_i += 1

    while vector_i < len(vector_pairs) and slot <= GDB_MERGED_MAX_PAIRS:
        if _append(vector_pairs[vector_i], RETRIEVAL_SOURCE_RAG):
            vector_backfill_used += 1
        vector_i += 1

    log.info(
        "merge: atlas_in=%d vector_in=%d priority(atlas=%d rag=%d) backfill(atlas=%d rag=%d) "
        "dedup_skipped=%d total_pairs=%d",
        len(atlas_pairs),
        len(vector_pairs),
        atlas_priority_used,
        vector_priority_used,
        atlas_backfill_used,
        vector_backfill_used,
        dedup_skipped,
        len(similar_match),
    )
    return similar_match


def _parse_sources(sources_raw, author_name) -> list[dict]:
    details = []
    author = author_name or "Unknown"
    if not sources_raw:
        details.append({
            "source_name": None,
            "source_link": "",
            "author_name": author
        })
        return details

    if isinstance(sources_raw, list):
        if all(isinstance(item, str) for item in sources_raw):
            i = 0
            while i < len(sources_raw):
                link = sources_raw[i]
                name = sources_raw[i+1] if i + 1 < len(sources_raw) else None
                details.append({
                    "source_name": name,
                    "source_link": link,
                    "author_name": author
                })
                i += 2
        else:
            for s in sources_raw:
                if isinstance(s, dict):
                    details.append({
                        "source_name": s.get("source_name") or s.get("name") or None,
                        "source_link": s.get("source_link") or s.get("source") or s.get("link") or s.get("url") or "",
                        "author_name": author
                    })
                elif isinstance(s, str):
                    details.append({
                        "source_name": None,
                        "source_link": s,
                        "author_name": author
                    })
    else:
        details.append({
            "source_name": None,
            "source_link": str(sources_raw),
            "author_name": author
        })
    return details


@mcp.tool()
async def gdb_search(
    query: str,
    crop: str,
    state: str,
    rephrased_query: Optional[str] = None,
    season: Optional[str] = None,
    domain: Optional[str] = None,
) -> str:
    """
    Search the golden database using parallel retrieval:
    1. Strict exact (raw query), Atlas keyword (rephrased), and vector RAG (rephrased) run in parallel.
    2. Strict exact short-circuits on hit (similarity_score=1).
    3. Otherwise merge Atlas keyword + vector RAG: priority GDB_ATLAS_TOP_K + GDB_VECTOR_TOP_K,
       dedupe by question_id, backfill up to GDB_MERGED_MAX_PAIRS unique pairs.
    Each match includes question_id, similarity_score, and retrieval_source (atlas | rag) for audit.
    """
    crop = (crop or "").strip() or "all"
    state = (state or "").strip() or "all"
    rephrased = (rephrased_query or "").strip() or query

    log.info(
        "gdb_search start query=%r rephrased=%r crop=%s state=%s season=%s domain=%s",
        _truncate_text(query, 80),
        _truncate_text(rephrased, 80),
        crop,
        state,
        season or "-",
        domain or "-",
    )

    response_data = {
        "original_query": query,
        "rephrased_query": rephrased,
        "state": state,
        "crop": crop,
        "exact_match": {},
        "similar_match": {}
    }

    # Start all 3 searches concurrently in parallel
    strict_task = asyncio.create_task(
        golden_strict_exact_search_tool(query=query, crop=crop, state=state)
    )
    exact_task = asyncio.create_task(
        golden_exact_search_tool(query=rephrased, crop=crop, state=state, season=season, domain=domain)
    )
    retriever_task = asyncio.create_task(
        golden_retriever_tool(query=rephrased, crop=crop, state=state, season=season, domain=domain)
    )

    # 1. Await strict exact search (1st priority) - Uses EXACT raw query
    strict_results = await strict_task
    log.info("gdb_search strict exact returned %d hit(s)", len(strict_results))
    if strict_results:
        exact_task.cancel()
        retriever_task.cancel()
        log.info("gdb_search: strict exact hit — cancelling atlas + vector tasks")
        pair = strict_results[0]
        response_data["exact_match"] = {
            "question_id": pair.question_id or "",
            "similarity_score": 1,
            "retrieval_source": RETRIEVAL_SOURCE_STRICT_EXACT,
            "question": pair.question_text,
            "answer": pair.answer_text,
            "details": _parse_sources(pair.sources, pair.author),
        }
        log.info(
            "gdb_search done path=strict_exact question_id=%s",
            pair.question_id,
        )
        return json.dumps(response_data)

    # 2–3. Merge Atlas keyword (top 2) + vector RAG (top 3) when no strict exact
    exact_out, retriever_out = await asyncio.gather(
        exact_task, retriever_task, return_exceptions=True
    )
    if isinstance(exact_out, Exception):
        log.warning("atlas keyword search failed: %s: %s", type(exact_out).__name__, exact_out)
        exact_results: list = []
    else:
        exact_results = exact_out or []

    if isinstance(retriever_out, Exception):
        log.warning("vector search failed: %s: %s", type(retriever_out).__name__, retriever_out)
        retriever_results: list = []
    else:
        retriever_results = retriever_out or []

    log.info(
        "gdb_search parallel done atlas_hits=%d vector_hits=%d (will merge top %d + %d)",
        len(exact_results),
        len(retriever_results),
        GDB_ATLAS_TOP_K,
        GDB_VECTOR_TOP_K,
    )
    similar_match = _build_merged_similar_match(exact_results or [], retriever_results or [])
    if similar_match:
        response_data["similar_match"] = similar_match
        log.info(
            "gdb_search done path=merged_similar pairs=%d",
            len(similar_match),
        )
        return json.dumps(response_data)

    log.warning(
        "gdb_search done path=empty (strict=%d atlas=%d vector=%d)",
        len(strict_results),
        len(exact_results or []),
        len(retriever_results or []),
    )
    return json.dumps(response_data)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")

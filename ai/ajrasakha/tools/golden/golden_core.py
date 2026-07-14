"""Golden DB retrieval core: strict exact + vector RAG."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import string
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

import httpx
from bson import ObjectId
from dotenv import load_dotenv
from pydantic import BaseModel
from pymongo import AsyncMongoClient

load_dotenv()

IST = timezone(timedelta(hours=5, minutes=30))


class ISTFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, IST)
        return dt.strftime(datefmt or "%Y-%m-%d %H:%M:%S") + " IST"


_log_handler = logging.StreamHandler()
_log_handler.setFormatter(ISTFormatter("%(asctime)s %(levelname)s [golden-api] %(message)s"))
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, handlers=[_log_handler])
log = logging.getLogger(__name__)

EMBEDDING_ENDPOINT = os.getenv("GOLDEN_EMBEDDING_ENDPOINT", "http://100.100.108.43:6001/embed")
EMBEDDING_TIMEOUT_S = float(os.getenv("GOLDEN_EMBEDDING_TIMEOUT_S", "15"))
MONGODB_URI = os.getenv("GOLDEN_MONGODB_URI")
MONGODB_DATABASE = os.getenv("GOLDEN_MONGODB_DATABASE", "agriai")
MONGODB_VECTOR_INDEX = os.getenv("GOLDEN_MONGODB_INDEX")
MONGODB_QUESTION_EMBEDDING_INDEX = os.getenv("GOLDEN_MONGODB_QUESTION_EMBEDDING_INDEX")
MONGODB_DUAL_EMBEDDING_INDEX = os.getenv("GOLDEN_MONGODB_DUAL_EMBEDDING_INDEX")
MONGODB_ANSWERS_VECTOR_INDEX = os.getenv("GOLDEN_MONGODB_ANSWERS_INDEX", "review_answers_vector_index")
MONGODB_SEARCH_INDEX = os.getenv("GOLDEN_MONGODB_SEARCH_INDEX", "review_questions_search_index")
GOLDEN_RAG_TOP_K = int(os.getenv("GOLDEN_RAG_TOP_K", "5"))

# Dual search configuration: top-K from each collection
QUESTIONS_TOP_K = int(os.getenv("QUESTIONS_TOP_K", "3"))
ANSWERS_TOP_K = int(os.getenv("ANSWERS_TOP_K", "2"))

# BM25 search configuration
BM25_TOP_K = int(os.getenv("BM25_TOP_K", "3"))
BM25_SEARCH_INDEX = os.getenv("BM25_SEARCH_INDEX", "review_questions_search_index")

RETRIEVAL_SOURCE_RAG = "rag"
RETRIEVAL_SOURCE_STRICT_EXACT = "strict_exact"
RETRIEVAL_SOURCE_BM25 = "bm25"

if not MONGODB_URI:
    raise RuntimeError("GOLDEN_MONGODB_URI is not set")
if not MONGODB_VECTOR_INDEX:
    raise RuntimeError("GOLDEN_MONGODB_INDEX is not set")
if not MONGODB_ANSWERS_VECTOR_INDEX:
    raise RuntimeError("GOLDEN_MONGODB_ANSWERS_INDEX is not set")
if not MONGODB_SEARCH_INDEX:
    raise RuntimeError("GOLDEN_MONGODB_SEARCH_INDEX is not set")

mongo_client = AsyncMongoClient(MONGODB_URI)
database = mongo_client[MONGODB_DATABASE]
answers_collection = database["answers"]
users_collection = database["users"]
questions_collection = database["questions"]


class QuestionAnswerPair(BaseModel):
    question_id: str
    question_text: str
    answer_text: str
    author: Optional[str]
    sources: List
    similarity_score: Optional[float] = None


class PendingQuestionCandidate(BaseModel):
    question_id: str
    question_text: str
    reference_question_id: Optional[str] = None
    created_at: Optional[datetime] = None
    similarity_score: Optional[float] = None


PENDING_DUPLICATE_SOURCES = ("AJRASAKHA", "WHATSAPP")
PENDING_DUPLICATE_STATUSES = ("open", "delayed", "in-review")
PENDING_VECTOR_TOP_K = 3


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
    pairs: list[QuestionAnswerPair],
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
        log.info(
            "%s[%d]: question_id=%s similarity_score=%s question=%r",
            path,
            i,
            pair.question_id,
            f"{pair.similarity_score:.4f}" if pair.similarity_score is not None else "n/a",
            _truncate_text(pair.question_text, 80),
        )


def _normalize_crop_for_search(crop: str) -> str:
    crop = (crop or "").strip()
    if not crop or crop.lower() == "all":
        return "all"
    crop = crop.lower().replace("_", " ")
    crop = re.sub(r"\s+", " ", crop).strip()
    return " ".join(word.capitalize() for word in crop.split())


def _normalize_crop_state(crop: str, state: str) -> tuple[str, str]:
    try:
        from .states_name import resolve_state_name
    except ImportError:
        from states_name import resolve_state_name

    crop = _normalize_crop_for_search(crop)
    state = resolve_state_name(state)
    return crop, state


def _author_display_name(user_document: dict | None) -> Optional[str]:
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
    embedding_field: str = "embedding",  # "embedding" for v1, "question_embedding" for v2
) -> list[dict[str, Any]]:
    # Use the correct index based on embedding field
    if embedding_field == "question_embedding":
        index_name = MONGODB_DUAL_EMBEDDING_INDEX or MONGODB_QUESTION_EMBEDDING_INDEX
    else:
        index_name = MONGODB_VECTOR_INDEX
    
    pipeline: list[dict[str, Any]] = [
        {
            "$vectorSearch": {
                "index": index_name,
                "path": embedding_field,
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
                "answer": 1,
                "answer_embedding": 1,
                "details": 1,
                "referenceQuestionId": 1,
                "createdAt": 1,
                "vector_score": {"$meta": "vectorSearchScore"},
            }
        },
    ]
    cursor = await questions_collection.aggregate(pipeline)
    return await cursor.to_list(length=k)


async def _vector_search_answers(
    *,
    query_vector: list[float],
    k: int,
    meta_filter: dict[str, Any],
) -> list[dict[str, Any]]:
    """Search answer_embedding in questions collection using dual index."""
    if MONGODB_DUAL_EMBEDDING_INDEX:
        # Use dual index on questions collection (answer_embedding is now in questions)
        pipeline: list[dict[str, Any]] = [
            {
                "$vectorSearch": {
                    "index": MONGODB_DUAL_EMBEDDING_INDEX,
                    "path": "answer_embedding",
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
                    "answer": 1,
                    "answer_embedding": 1,
                    "details": 1,
                    "vector_score": {"$meta": "vectorSearchScore"},
                }
            },
        ]
        cursor = await questions_collection.aggregate(pipeline)
        return await cursor.to_list(length=k)
    else:
        # Fallback to old answers collection
        pipeline = [
            {
                "$vectorSearch": {
                    "index": MONGODB_ANSWERS_VECTOR_INDEX,
                    "path": "answer_embedding",
                    "queryVector": query_vector,
                    "numCandidates": max(50, k * 10),
                    "limit": k,
                    "filter": meta_filter,
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "questionId": 1,
                    "answer": 1,
                    "sources": 1,
                    "authorId": 1,
                    "vector_score": {"$meta": "vectorSearchScore"},
                }
            },
        ]
        cursor = await answers_collection.aggregate(pipeline)
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


async def vector_rag_search(
    query: str,
    crop: str,
    state: str,
    *,
    season: str | None = None,
    domain: str | None = None,
    top_k: int | None = None,
    use_dual_search: bool = False,
    embedding_field: str = "embedding",  # "embedding" for v1, "question_embedding" for v2
) -> list[QuestionAnswerPair]:
    crop, state = _normalize_crop_state(crop, state)
    k = top_k or GOLDEN_RAG_TOP_K
    q_k = QUESTIONS_TOP_K
    a_k = ANSWERS_TOP_K
    
    filters: dict[str, Any] = {"status": "closed"}
    if crop != "all":
        filters["details.normalised_crop"] = crop
    if state != "all":
        filters["details.state"] = state
    if season:
        filters["details.season"] = season
    if domain:
        filters["details.domain"] = domain
    
    # Answer filter - when using dual index, use same filters as questions
    # When using old answers collection, this will be overridden
    answer_filter: dict[str, Any] = filters.copy()

    if use_dual_search:
        log.info(
            "vector search start query=%r crop=%s state=%s questions_k=%d answers_k=%d dual_search=True field=%s",
            _truncate_text(query, 80),
            crop,
            state,
            q_k,
            a_k,
            embedding_field,
        )
    else:
        log.info(
            "vector search start query=%r crop=%s state=%s top_k=%d dual_search=False field=%s",
            _truncate_text(query, 80),
            crop,
            state,
            k,
            embedding_field,
        )
    try:
        query_vector = await _embed_text(query)
        
        if use_dual_search:
            # Dual search: questions + answers in parallel
            questions_task = _vector_search_questions(
                query_vector=query_vector, k=q_k, meta_filter=filters, embedding_field=embedding_field
            )
            answers_task = _vector_search_answers(
                query_vector=query_vector, k=a_k, meta_filter=answer_filter
            )
            question_docs, answer_docs = await asyncio.gather(questions_task, answers_task)
            log.info("dual search results: questions=%d (k=%d), answers=%d (k=%d) → combined=%d",
                     len(question_docs), q_k, len(answer_docs), a_k, len(question_docs) + len(answer_docs))
        else:
            # Original: only questions
            question_docs = await _vector_search_questions(
                query_vector=query_vector, k=k, meta_filter=filters, embedding_field=embedding_field
            )
            answer_docs = []
            log.info("vector search: questions=%d", len(question_docs))
    except Exception as exc:
        log.warning("vector search failed: %s: %s", type(exc).__name__, exc)
        return []

    result: list[QuestionAnswerPair] = []
    seen_question_ids: set[str] = set()
    
    # Process question results
    for doc in question_docs:
        score = doc.get("vector_score")
        question_id = str(doc["_id"])
        answer, sources, author_name = await _get_answer_text_sources_and_author_name(
            question_id
        )
        if not answer:
            continue
        result.append(
            QuestionAnswerPair(
                question_id=question_id,
                question_text=doc.get("question") or doc.get("text", ""),
                answer_text=answer,
                author=author_name,
                sources=sources,
                similarity_score=score,
            )
        )
        seen_question_ids.add(question_id)
    
    # Process answer results (only if dual search)
    if use_dual_search:
        for doc in answer_docs:
            score = doc.get("vector_score")
            # When using dual index, answer comes from questions collection (has _id)
            # When using old answers collection, answer has questionId
            question_id = str(doc.get("_id") or doc.get("questionId"))
            
            if question_id in seen_question_ids:
                continue
            
            # Get question text - either from doc itself (dual index) or lookup (old)
            question_text = doc.get("question") or doc.get("text", "")
            if not question_text:
                question_doc = await questions_collection.find_one(
                    {"_id": ObjectId(question_id)},
                    {"question": 1, "text": 1}
                )
                if question_doc:
                    question_text = question_doc.get("question") or question_doc.get("text", "")
            
            if not question_text:
                continue
            
            # Get answer text, sources, author - from doc if using dual index, or lookup from answers collection
            answer_text = doc.get("answer", "")
            sources = []
            author_id = None
            
            if not answer_text:
                answer_doc = await answers_collection.find_one(
                    {"questionId": ObjectId(question_id), "isFinalAnswer": True},
                    {"answer": 1, "sources": 1, "authorId": 1}
                )
                if answer_doc:
                    answer_text = answer_doc.get("answer", "")
                    sources = answer_doc.get("sources", [])
                    author_id = answer_doc.get("authorId")
            
            if not answer_text:
                continue
            
            # Get author name if we don't have it yet
            author_name = None
            if author_id:
                user_doc = await users_collection.find_one(
                    {"_id": ObjectId(author_id)},
                    {"firstName": 1, "lastName": 1, "name": 1},
                )
                author_name = _author_display_name(user_doc)
            
            result.append(
                QuestionAnswerPair(
                    question_id=question_id,
                    question_text=question_text,
                    answer_text=answer_text,
                    author=author_name,
                    sources=sources if isinstance(sources, list) else [],
                    similarity_score=score,
                )
            )
            seen_question_ids.add(question_id)
        
        # Sort by score and limit
        result.sort(key=lambda x: x.similarity_score or 0, reverse=True)
        result = result[:k]
    
    _log_search_hits("vector", query, crop, state, result)
    return result


def _normalize_question_text(t: str) -> str:
    return re.sub(
        r"\s+",
        " ",
        t.translate(str.maketrans("", "", string.punctuation)).lower(),
    ).strip()


async def strict_exact_search(
    query: str,
    crop: str,
    state: str,
) -> list[QuestionAnswerPair]:
    crop, state = _normalize_crop_state(crop, state)
    log.info(
        "strict exact search start query=%r crop=%s state=%s",
        _truncate_text(query, 80),
        crop,
        state,
    )
    meta_filter: dict = {"status": "closed"}
    if crop != "all":
        meta_filter["details.normalised_crop"] = crop
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
        {"$match": meta_filter},
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
    log.info("strict exact: search candidates=%d", len(raw_results))

    if not raw_results:
        return []

    norm_query = _normalize_question_text(query)
    result: list[QuestionAnswerPair] = []
    for doc in raw_results:
        if _normalize_question_text(doc.get("question") or doc.get("text", "")) != norm_query:
            continue
        question_id = str(doc["_id"])
        try:
            answer, sources, author_name = await _get_answer_text_sources_and_author_name(
                question_id
            )
        except Exception:
            continue
        if not answer:
            continue
        pair = QuestionAnswerPair(
            question_id=question_id,
            question_text=doc.get("question") or doc.get("text", ""),
            answer_text=answer,
            author=author_name,
            sources=sources,
            similarity_score=1.0,
        )
        result.append(pair)
        log.info(
            "strict exact: match question_id=%s question=%r",
            question_id,
            _truncate_text(pair.question_text, 80),
        )
        break

    if not result:
        log.info(
            "strict exact: no normalized-text match among %d candidate(s)",
            len(raw_results),
        )
    return result


async def bm25_search(
    keywords: str,
    crop: str,
    state: str,
    *,
    exclude_question_ids: set[str] | None = None,
    top_k: int | None = None,
) -> list[QuestionAnswerPair]:
    """
    BM25 keyword search returning QuestionAnswerPairs.
    
    This searches using extracted agricultural keywords and returns
    formatted pairs suitable for the RAG pipeline.
    
    Args:
        keywords: Space-separated keywords from keyword extraction
        crop: Crop filter
        state: State filter
        exclude_question_ids: Question IDs to exclude (from semantic results)
        top_k: Maximum results to return
    
    Returns:
        List of QuestionAnswerPairs from BM25 search
    """
    k = top_k or BM25_TOP_K
    
    if not keywords or not keywords.strip():
        log.info("BM25 search skipped: no keywords provided")
        return []
    
    crop, state = _normalize_crop_state(crop, state)
    log.info(
        "bm25 search start keywords=%r crop=%s state=%s top_k=%d",
        _truncate_text(keywords, 80),
        crop,
        state,
        k,
    )
    
    # Build filter for closed questions
    filters: dict[str, Any] = {"status": "closed"}
    if crop != "all":
        filters["details.normalised_crop"] = crop
    if state != "all":
        filters["details.state"] = state
    
    try:
        pipeline = [
            {
                "$search": {
                    "index": BM25_SEARCH_INDEX,
                    "text": {
                        "query": keywords,
                        "path": ["question", "text", "answer"],
                        "fuzzy": {"maxEdits": 2},  # Allow typo tolerance
                    },
                }
            },
            {"$match": filters},
            {
                "$project": {
                    "_id": 1,
                    "question": 1,
                    "text": 1,
                    "answer": 1,
                    "search_score": {"$meta": "searchScore"},
                }
            },
            {"$limit": k},
        ]
        
        cursor = await questions_collection.aggregate(pipeline)
        raw_results = await cursor.to_list(length=k)
        log.info("bm25 search returned %d candidates", len(raw_results))
        
        if not raw_results:
            return []
        
        result: list[QuestionAnswerPair] = []
        
        for doc in raw_results:
            question_id = str(doc["_id"])
            
            # Skip if already in semantic results
            if exclude_question_ids and question_id in exclude_question_ids:
                log.info("BM25: skipping duplicate question_id=%s", question_id)
                continue
            
            answer, sources, author_name = await _get_answer_text_sources_and_author_name(question_id)
            if not answer:
                continue
            
            score = doc.get("search_score")
            # Normalize score to 0-1 range
            similarity_score = min(max((score or 0.5) / 10.0, 0.0), 1.0) if score else 0.5
            
            result.append(
                QuestionAnswerPair(
                    question_id=question_id,
                    question_text=doc.get("question") or doc.get("text", ""),
                    answer_text=answer,
                    author=author_name,
                    sources=sources if sources else [],
                    similarity_score=similarity_score,
                )
            )
            log.info(
                "BM25[%s]: score=%s question=%r",
                question_id,
                f"{score:.4f}" if score else "n/a",
                _truncate_text(doc.get("question") or "", 60),
            )
        
        _log_search_hits("bm25", keywords, crop, state, result)
        return result
        
    except Exception as exc:
        log.warning("bm25 search failed: %s: %s", type(exc).__name__, exc)
        return []


def _pending_meta_filter(
    crop: str,
    state: str,
    *,
    exclude_question_id: str | None = None,
    created_before: datetime | None = None,
) -> dict[str, Any]:
    filters: dict[str, Any] = {
        "status": {"$in": list(PENDING_DUPLICATE_STATUSES)},
        "source": {"$in": list(PENDING_DUPLICATE_SOURCES)},
    }
    if crop != "all":
        filters["details.normalised_crop"] = crop
    if state != "all":
        filters["details.state"] = state
    if created_before is not None:
        filters["createdAt"] = {"$lt": _mongo_datetime_cutoff(created_before)}
    if exclude_question_id:
        try:
            filters["_id"] = {"$ne": ObjectId(exclude_question_id)}
        except Exception:
            pass
    return filters


def _mongo_datetime_cutoff(dt: datetime) -> datetime:
    """Mongo question createdAt is stored naive UTC; normalize cutoff for comparison."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _pending_vector_index_filter(crop: str, state: str) -> dict[str, Any]:
    """Fields allowed in Atlas $vectorSearch pre-filter (source/createdAt are not)."""
    filters: dict[str, Any] = {
        "status": {"$in": list(PENDING_DUPLICATE_STATUSES)},
    }
    if crop != "all":
        filters["details.normalised_crop"] = crop
    if state != "all":
        filters["details.state"] = state
    return filters


def _pending_vector_post_match(
    *,
    exclude_question_id: str | None = None,
    created_before: datetime | None = None,
) -> dict[str, Any]:
    """Post-$vectorSearch $match for fields not indexed on the vector path."""
    post: dict[str, Any] = {
        "source": {"$in": list(PENDING_DUPLICATE_SOURCES)},
    }
    if created_before is not None:
        post["createdAt"] = {"$lt": _mongo_datetime_cutoff(created_before)}
    if exclude_question_id:
        try:
            post["_id"] = {"$ne": ObjectId(exclude_question_id)}
        except Exception:
            pass
    return post


async def _pending_vector_search_questions(
    *,
    query_vector: list[float],
    k: int,
    index_filter: dict[str, Any],
    post_match: dict[str, Any],
) -> list[dict[str, Any]]:
    """Vector search with index-safe pre-filter + $match for source/createdAt."""
    fetch_limit = max(30, k * 10)
    pipeline: list[dict[str, Any]] = [
        {
            "$vectorSearch": {
                "index": MONGODB_VECTOR_INDEX,
                "path": "question_embedding",
                "queryVector": query_vector,
                "numCandidates": max(100, fetch_limit * 10),
                "limit": fetch_limit,
                "filter": index_filter,
            }
        },
        {"$match": post_match},
        {
            "$project": {
                "_id": 1,
                "question": 1,
                "text": 1,
                "details": 1,
                "referenceQuestionId": 1,
                "createdAt": 1,
                "source": 1,
                "vector_score": {"$meta": "vectorSearchScore"},
            }
        },
        {"$limit": k},
    ]
    cursor = await questions_collection.aggregate(pipeline)
    return await cursor.to_list(length=k)


def _crop_from_question_details(details: dict | None) -> str:
    details = details or {}
    normalised = (details.get("normalised_crop") or "").strip()
    if normalised:
        return normalised
    crop = details.get("crop") or ""
    if isinstance(crop, dict):
        crop = crop.get("name") or ""
    return str(crop).strip()


def _parse_created_at(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return None


def parse_created_before(value: str) -> datetime:
    """Parse ISO-8601 timestamp e.g. 2026-05-31T12:10:16.649+00:00."""
    raw = (value or "").strip()
    if not raw:
        raise ValueError("created_before must be a non-empty ISO-8601 timestamp")
    normalized = raw.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(
            f"created_before must be ISO-8601 (e.g. 2026-05-31T12:10:16.649+00:00), got: {raw!r}"
        ) from exc


def _doc_to_pending_candidate(
    doc: dict[str, Any],
    *,
    similarity_score: float | None = None,
) -> PendingQuestionCandidate:
    ref = doc.get("referenceQuestionId")
    ref_id = str(ref) if ref else None
    return PendingQuestionCandidate(
        question_id=str(doc["_id"]),
        question_text=doc.get("question") or doc.get("text", ""),
        reference_question_id=ref_id,
        created_at=_parse_created_at(doc.get("createdAt")),
        similarity_score=similarity_score,
    )


def _log_pending_hits(
    path: str,
    query: str,
    crop: str,
    state: str,
    candidates: list[PendingQuestionCandidate],
) -> None:
    if not candidates:
        log.info(
            "%s: no hits query=%r crop=%s state=%s",
            path,
            _truncate_text(query, 80),
            crop,
            state,
        )
        return
    for i, cand in enumerate(candidates, 1):
        log.info(
            "%s[%d]: question_id=%s ref_id=%s similarity_score=%s question=%r",
            path,
            i,
            cand.question_id,
            cand.reference_question_id or "n/a",
            f"{cand.similarity_score:.4f}" if cand.similarity_score is not None else "n/a",
            _truncate_text(cand.question_text, 80),
        )


async def get_question_by_id(question_id: str) -> dict[str, Any] | None:
    try:
        oid = ObjectId(question_id)
    except Exception:
        return None
    return await questions_collection.find_one(
        {"_id": oid},
        {"question": 1, "text": 1, "details": 1, "createdAt": 1},
    )


async def pending_exact_search(
    query: str,
    crop: str,
    state: str,
    *,
    exclude_question_id: str | None = None,
    created_before: datetime | None = None,
) -> list[PendingQuestionCandidate]:
    crop, state = _normalize_crop_state(crop, state)
    log.info(
        "pending exact search start query=%r crop=%s state=%s exclude=%s created_before=%s",
        _truncate_text(query, 80),
        crop,
        state,
        exclude_question_id or "none",
        created_before.isoformat() if created_before else "none",
    )
    meta_filter = _pending_meta_filter(
        crop,
        state,
        exclude_question_id=exclude_question_id,
        created_before=created_before,
    )

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
        {"$match": meta_filter},
        {"$limit": 10},
        {
            "$project": {
                "_id": 1,
                "question": 1,
                "text": 1,
                "referenceQuestionId": 1,
                "createdAt": 1,
            }
        },
    ]

    cursor = await questions_collection.aggregate(pipeline)
    raw_results = await cursor.to_list(length=10)
    log.info("pending exact: search candidates=%d", len(raw_results))

    if not raw_results:
        return []

    norm_query = _normalize_question_text(query)
    result: list[PendingQuestionCandidate] = []
    for doc in raw_results:
        if _normalize_question_text(doc.get("question") or doc.get("text", "")) != norm_query:
            continue
        result.append(_doc_to_pending_candidate(doc, similarity_score=1.0))

    _log_pending_hits("pending_exact", query, crop, state, result)
    return result


async def pending_vector_search(
    query: str,
    crop: str,
    state: str,
    *,
    exclude_question_id: str | None = None,
    created_before: datetime | None = None,
    top_k: int = PENDING_VECTOR_TOP_K,
) -> list[PendingQuestionCandidate]:
    crop, state = _normalize_crop_state(crop, state)
    index_filter = _pending_vector_index_filter(crop, state)
    post_match = _pending_vector_post_match(
        exclude_question_id=exclude_question_id,
        created_before=created_before,
    )

    log.info(
        "pending vector search start query=%r crop=%s state=%s top_k=%d exclude=%s created_before=%s",
        _truncate_text(query, 80),
        crop,
        state,
        top_k,
        exclude_question_id or "none",
        created_before.isoformat() if created_before else "none",
    )
    try:
        query_vector = await _embed_text(query)
        docs = await _pending_vector_search_questions(
            query_vector=query_vector,
            k=top_k,
            index_filter=index_filter,
            post_match=post_match,
        )
    except Exception as exc:
        log.warning("pending vector search failed: %s: %s", type(exc).__name__, exc)
        return []

    log.info("pending vector search mongo returned %d doc(s)", len(docs))
    result = [
        _doc_to_pending_candidate(doc, similarity_score=doc.get("vector_score"))
        for doc in docs
    ]
    _log_pending_hits("pending_vector", query, crop, state, result)
    return result


def match_entry(pair: QuestionAnswerPair, retrieval_source: str, **extra: Any) -> dict:
    entry = {
        "question_id": pair.question_id or "",
        "similarity_score": pair.similarity_score,
        "retrieval_source": retrieval_source,
        "question": pair.question_text,
        "answer": pair.answer_text,
        "details": parse_sources(pair.sources, pair.author),
    }
    entry.update(extra)
    return entry


def parse_sources(sources_raw, author_name) -> list[dict]:
    details = []
    author = author_name or "Unknown"
    if not sources_raw:
        details.append({
            "source_name": None,
            "source_link": "",
            "author_name": author,
        })
        return details

    if isinstance(sources_raw, list):
        if all(isinstance(item, str) for item in sources_raw):
            i = 0
            while i < len(sources_raw):
                link = sources_raw[i]
                name = sources_raw[i + 1] if i + 1 < len(sources_raw) else None
                details.append({
                    "source_name": name,
                    "source_link": link,
                    "author_name": author,
                })
                i += 2
        else:
            for s in sources_raw:
                if isinstance(s, dict):
                    details.append({
                        "source_name": (
                            s.get("source_name")
                            or s.get("sourceName")
                            or s.get("name")
                            or None
                        ),
                        "source_link": (
                            s.get("source_link")
                            or s.get("source")
                            or s.get("link")
                            or s.get("url")
                            or ""
                        ),
                        "author_name": author,
                    })
                elif isinstance(s, str):
                    details.append({
                        "source_name": None,
                        "source_link": s,
                        "author_name": author,
                    })
    else:
        details.append({
            "source_name": None,
            "source_link": str(sources_raw),
            "author_name": author,
        })
    return details

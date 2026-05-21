import os
from typing import List, Optional

from bson import ObjectId
from pydantic import BaseModel
from pymongo import AsyncMongoClient

from vector_retrieval import (
    fetch_query_embedding,
    get_sync_questions_collection,
    vector_search_with_prefetched_embedding,
    vector_search_with_score,
)

MONGODB_URI = os.getenv("REVIEWER_MONGODB_URI")
MONGODB_DATABASE = os.getenv("REVIEWER_MONGODB_DATABASE", "agriai")
MONGODB_COLLECTION = os.getenv("REVIEWER_MONGODB_COLLECTION", "questions")
MONGODB_INDEX = os.getenv("REVIEWER_MONGODB_INDEX")

_sync_questions_collection = None


def _get_sync_questions_collection():
    global _sync_questions_collection
    if _sync_questions_collection is None:
        if not MONGODB_URI:
            raise ValueError("REVIEWER_MONGODB_URI must be set")
        if not MONGODB_INDEX:
            raise ValueError("REVIEWER_MONGODB_INDEX must be set")
        _sync_questions_collection = get_sync_questions_collection(
            MONGODB_URI, MONGODB_DATABASE, MONGODB_COLLECTION
        )
    return _sync_questions_collection


mongo_client = AsyncMongoClient(MONGODB_URI) if MONGODB_URI else None
# AsyncDatabase does not support truthiness (if database); compare client explicitly.
database = mongo_client[MONGODB_DATABASE] if mongo_client is not None else None
answers_collection = (
    database["answers"] if mongo_client is not None else None
)
users_collection = database["users"] if mongo_client is not None else None


class QuestionAnswerPair(BaseModel):
    question_id: str
    question_text: str
    answer_text: str
    author: Optional[str]
    sources: List
    similarity_score: Optional[float] = None


async def _get_answer_text_sources_and_author_name(question_id: str):
    answer_document = await answers_collection.find_one(
        {
            "questionId": ObjectId(question_id)
        },
        {
            "sources": 1,
            "authorId": 1,
            "answer": 1,
        },
    )
    user_document = await users_collection.find_one(
        {
            "_id": ObjectId(answer_document["authorId"])
        }
    )
    author_name = user_document['firstName']
    sources = answer_document["sources"]
    answer = answer_document["answer"]

    return answer, sources, author_name


def _crop_filter_values(crop: str | list[str] | None) -> list[str] | None:
    if crop is None:
        return None
    if isinstance(crop, str):
        s = crop.strip()
        return [s] if s else None
    out: list[str] = []
    for c in crop:
        if isinstance(c, str) and c.strip():
            out.append(c.strip())
    return out or None


async def _similarity_search_merge_variants(
    query: str,
    k: int,
    base_filters: dict,
    crop_variants: list[str],
):
    """One search per crop string; merge by question id keeping best score."""
    coll = _get_sync_questions_collection()
    embedding = await fetch_query_embedding(query)
    best: dict[str, tuple] = {}
    index_name = MONGODB_INDEX
    for c in crop_variants:
        fl = dict(base_filters)
        fl["details.normalised_crop"] = c
        batch = await vector_search_with_prefetched_embedding(
            coll, index_name, embedding, fl, k
        )
        for document, score in batch:
            qid = document.metadata.get("_id")
            if qid is None:
                continue
            prev = best.get(qid)
            if prev is None or score > prev[1]:
                best[qid] = (document, score)
    merged = sorted(best.values(), key=lambda x: x[1], reverse=True)[:k]
    return merged


async def reviewer_retriever_tool(
    query: str,
    crop: str | list[str] | None = None,
    season: str | None = None,
    state: str | None = None,
    domain: str | None = None,
):
    """Retrieve relevant documents from the reviewer dataset based on the query and optional filters."""
    filters: dict = {"status": "closed"}

    crop_variants = _crop_filter_values(crop)
    if crop_variants:
        if len(crop_variants) == 1:
            filters["details.normalised_crop"] = crop_variants[0]
        else:
            filters["details.normalised_crop"] = {"$in": crop_variants}
    if season:
        filters["details.season"] = season
    if state:
        filters["details.state"] = state
    if domain:
        filters["details.domain"] = domain

    coll = _get_sync_questions_collection()

    try:
        docs = await vector_search_with_score(
            coll, MONGODB_INDEX, query, filters, 5
        )
    except Exception:
        if crop_variants and len(crop_variants) > 1:
            base = {k: v for k, v in filters.items() if k != "details.normalised_crop"}
            docs = await _similarity_search_merge_variants(query, 5, base, crop_variants)
        else:
            raise

    result = []
    for document, score in docs:
        answer, sources, author_name = await _get_answer_text_sources_and_author_name(
            document.metadata['_id']
        )
        question_answer_pair = QuestionAnswerPair(
            question_id=document.metadata['_id'],
            question_text=document.metadata['question'],
            answer_text=answer,
            author=author_name,
            sources=sources,
            similarity_score=score,
        )
        result.append(question_answer_pair)
    return result

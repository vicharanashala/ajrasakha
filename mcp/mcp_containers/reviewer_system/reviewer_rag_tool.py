import os
from typing import List, Optional

from bson import ObjectId
from langchain.tools import tool
from pydantic import BaseModel
from pymongo import AsyncMongoClient

from utils import get_mongodb_vector_store, get_huggingface_embedding_model

EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5"
MONGODB_URI = os.getenv("REVIEWER_MONGODB_URI")
MONGODB_DATABASE = "agriai"
MONGODB_COLLECTION = "questions"
MONGODB_INDEX = os.getenv("REVIEWER_MONGODB_INDEX")

embedding_model = get_huggingface_embedding_model(EMBEDDING_MODEL)
vector_store = get_mongodb_vector_store(
    embedding_model,
    MONGODB_URI,
    MONGODB_DATABASE,
    MONGODB_COLLECTION,
    MONGODB_INDEX,
)

mongo_client = AsyncMongoClient(MONGODB_URI)
database = mongo_client["agriai"]
answers_collection = database["answers"]
users_collection = database["users"]


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


def _similarity_search_merge_variants(
    query: str,
    k: int,
    base_filters: dict,
    crop_variants: list[str],
):
    """One search per crop string; merge by question id keeping best score."""
    best: dict[str, tuple] = {}
    for c in crop_variants:
        fl = dict(base_filters)
        fl["details.crop"] = c
        batch = vector_store.similarity_search_with_score(query, k=k, pre_filter=fl)
        for document, score in batch:
            qid = document.metadata.get("_id")
            if qid is None:
                continue
            prev = best.get(qid)
            if prev is None or score > prev[1]:
                best[qid] = (document, score)
    merged = sorted(best.values(), key=lambda x: x[1], reverse=True)[:k]
    return merged


@tool
async def reviewer_retriever_tool(
        query: str,
        crop: str | list[str] | None = None,
        season: str | None = None,
        state: str | None = None,
        domain: str | None = None,
):
    '''Retrieve relevant documents from the reviewer dataset based on the query and optional filters.'''
    filters: dict = {"status": "closed"}

    crop_variants = _crop_filter_values(crop)
    if crop_variants:
        if len(crop_variants) == 1:
            filters["details.crop"] = crop_variants[0]
        else:
            filters["details.crop"] = {"$in": crop_variants}
    if season:
        filters["details.season"] = season
    if state:
        filters["details.state"] = state
    if domain:
        filters["details.domain"] = domain

    try:
        docs = vector_store.similarity_search_with_score(query, k=5, pre_filter=filters)
    except Exception:
        if crop_variants and len(crop_variants) > 1:
            base = {k: v for k, v in filters.items() if k != "details.crop"}
            docs = _similarity_search_merge_variants(query, 5, base, crop_variants)
        else:
            raise

    result = []
    for doc in docs:
        document, score = doc
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

"""HTTP embedding + MongoDB Atlas $vectorSearch (no LangChain / local HF)."""

from __future__ import annotations

import asyncio
import os
from typing import Any

import aiohttp
from pymongo import MongoClient
from pymongo.collection import Collection

EMBEDDING_API_URL = os.getenv("EMBEDDING_API_URL", "http://100.100.108.44:6001/embed")
REVIEWER_VECTOR_EMBEDDING_PATH = os.getenv("REVIEWER_VECTOR_EMBEDDING_PATH", "embedding")


async def fetch_query_embedding(query: str) -> list[float]:
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            EMBEDDING_API_URL,
            json={"text": query},
            headers={"Content-Type": "application/json"},
        ) as response:
            response.raise_for_status()
            payload = await response.json()

    embedding = payload.get("embedding")
    if not isinstance(embedding, list) or not embedding:
        raise ValueError("Embedding API returned invalid 'embedding' payload")
    return embedding


def raw_vector_search(
    collection: Collection,
    index_name: str,
    embedding_path: str,
    embedding: list[float],
    pre_filter: dict[str, Any] | None,
    limit: int,
) -> list[dict]:
    vs_stage: dict[str, Any] = {
        "index": index_name,
        "path": embedding_path,
        "queryVector": embedding,
        "numCandidates": max(limit * 10, limit),
        "limit": limit,
    }
    if pre_filter:
        vs_stage["filter"] = pre_filter

    pipeline = [
        {"$vectorSearch": vs_stage},
        {"$set": {"score": {"$meta": "vectorSearchScore"}}},
    ]
    return list(collection.aggregate(pipeline))


def _doc_to_metadata(doc: dict) -> dict[str, Any]:
    """Match prior LangChain Document.metadata shape: _id + question."""
    oid = doc.get("_id")
    qtext = doc.get("question")
    if qtext is None:
        qtext = doc.get("text", "")
    return {
        "_id": str(oid) if oid is not None else "",
        "question": qtext if isinstance(qtext, str) else str(qtext or ""),
    }


class RetrievedDocument:
    __slots__ = ("metadata",)

    def __init__(self, metadata: dict[str, Any]):
        self.metadata = metadata


def map_hits_to_scored_docs(rows: list[dict]) -> list[tuple[RetrievedDocument, float]]:
    out: list[tuple[RetrievedDocument, float]] = []
    for doc in rows:
        score = float(doc.get("score", 0.0))
        meta = _doc_to_metadata(doc)
        out.append((RetrievedDocument(meta), score))
    return out


async def vector_search_with_score(
    collection: Collection,
    index_name: str,
    query: str,
    pre_filter: dict[str, Any],
    k: int,
    embedding_path: str = REVIEWER_VECTOR_EMBEDDING_PATH,
) -> list[tuple[RetrievedDocument, float]]:
    embedding = await fetch_query_embedding(query)
    return await vector_search_with_prefetched_embedding(
        collection, index_name, embedding, pre_filter, k, embedding_path
    )


async def vector_search_with_prefetched_embedding(
    collection: Collection,
    index_name: str,
    embedding: list[float],
    pre_filter: dict[str, Any],
    k: int,
    embedding_path: str = REVIEWER_VECTOR_EMBEDDING_PATH,
) -> list[tuple[RetrievedDocument, float]]:
    def run() -> list[dict]:
        return raw_vector_search(
            collection,
            index_name,
            embedding_path,
            embedding,
            pre_filter,
            k,
        )

    rows = await asyncio.to_thread(run)
    return map_hits_to_scored_docs(rows)


def get_sync_questions_collection(
    mongo_uri: str,
    db_name: str,
    collection_name: str,
) -> Collection:
    client = MongoClient(mongo_uri)
    return client[db_name][collection_name]

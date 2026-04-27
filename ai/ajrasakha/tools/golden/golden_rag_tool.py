import os
from typing import List, Optional
from mcp.server.fastmcp import FastMCP

from bson import ObjectId
from langchain.tools import tool
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel
from pymongo import AsyncMongoClient

from ajrasakha.utils import get_mongodb_vector_store, get_huggingface_embedding_model

EMBEDDING_MODEL = os.getenv("GOLDEN_EMBEDDING_MODEL")
MONGODB_URI = os.getenv("GOLDEN_MONGODB_URI")
MONGODB_DATABASE = os.getenv("GOLDEN_MONGODB_DATABASE")
MONGODB_COLLECTION = os.getenv("GOLDEN_MONGODB_COLLECTION")
MONGODB_VECTOR_INDEX = os.getenv("GOLDEN_MONGODB_INDEX")
MONGODB_SEARCH_INDEX = os.getenv("GOLDEN_MONGODB_SEARCH_INDEX")

embedding_model = get_huggingface_embedding_model(EMBEDDING_MODEL)
vector_store = get_mongodb_vector_store(
    embedding_model,
    MONGODB_URI,
    MONGODB_DATABASE,
    MONGODB_COLLECTION,
    MONGODB_VECTOR_INDEX,
)

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


@mcp.tool()
async def golden_retriever_tool(
        query: str,
        crop: str | None = None,
        season: str | None = None,
        state: str | None = None,
        domain: str | None = None,
):
    '''Retrieve relevant documents from the Golden dataset based on the query and optional filters.'''
    filters = {"status": "closed"}

    if crop:
        filters["details.crop"] = crop
    if season:
        filters["details.season"] = season
    if state:
        filters["details.state"] = state
    if domain:
        filters["details.domain"] = domain

    docs = vector_store.similarity_search_with_score(query, k=5, pre_filter=filters)
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
async def golden_exact_search_tool(
        query: str,
        crop: str | None = None,
        season: str | None = None,
        state: str | None = None,
        domain: str | None = None,
        min_score: float = 1.0,
) -> list:
    """
    Search the Golden dataset using full-text keyword matching on the 'question'
    and 'text' fields via MongoDB Atlas Search ($search).

    This does NOT use embeddings. It finds documents where the query words
    appear literally in the question or text. Use this when the user's query
    contains specific keywords, crop names, disease names, or technical terms
    that should match word-for-word in the database.

    Falls back to an empty list if no keyword matches are found — the caller
    should then fall back to golden_retriever_tool (vector search).

    Args:
        query:     The user's question or keywords to match.
        crop:      Optional crop filter (e.g. "Wheat", "Rice").
        season:    Optional season filter (e.g. "Kharif", "Rabi").
        state:     Optional state filter (e.g. "Punjab", "Maharashtra").
        domain:    Optional domain filter (e.g. "pest management").
        min_score: Minimum Atlas Search relevance score to include a result.
                   Default 1.0 — raise this to require stronger keyword matches.
    """
    # --- Build post-search metadata filters ---
    meta_filter: dict = {"status": "closed"}
    if crop:
        meta_filter["details.crop"] = crop
    if season:
        meta_filter["details.season"] = season
    if state:
        meta_filter["details.state"] = state
    if domain:
        meta_filter["details.domain"] = domain

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

    raw_results = await questions_collection.aggregate(pipeline).to_list(length=5)

    if not raw_results:
        return []

    result = []
    for doc in raw_results:
        question_id = str(doc["_id"])
        try:
            answer, sources, author_name = await _get_answer_text_sources_and_author_name(
                question_id
            )
        except Exception:
            # Answer may not exist yet for some questions — skip gracefully
            continue

        question_answer_pair = QuestionAnswerPair(
            question_id=question_id,
            question_text=doc.get("question") or doc.get("text", ""),
            answer_text=answer,
            author=author_name,
            sources=sources,
            similarity_score=doc.get("search_score"),
        )
        result.append(question_answer_pair)

    return result


if __name__ == "__main__":
    mcp.run(transport="streamable-http")

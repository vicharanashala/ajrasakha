import os
import asyncio
import json
from typing import List, Optional
from mcp.server.fastmcp import FastMCP

from bson import ObjectId
from langchain.tools import tool
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel
from pymongo import AsyncMongoClient
from dotenv import load_dotenv

load_dotenv()
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

    # Run in asyncio.to_thread because langchain vector_store performs synchronous socket calls
    docs = await asyncio.to_thread(
        vector_store.similarity_search_with_score, query, k=5, pre_filter=filters
    )
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

    if not raw_results:
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

            question_answer_pair = QuestionAnswerPair(
                question_id=question_id,
                question_text=doc.get("question") or doc.get("text", ""),
                answer_text=answer,
                author=author_name,
                sources=sources,
            )
            result.append(question_answer_pair)
            break  # Return only the first matching exact pair

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
    Search the golden database directly using an optimized prioritized parallel execution strategy:
    1. Fires strict exact matching, Atlas Search keyword matching, and semantic vector similarity search in parallel.
    2. Enforces search priorities: strict exact search (1st priority), golden exact search (2nd priority), golden vector search (3rd priority).
    3. Instantly short-circuits and cancels lower priority runs if a higher priority one returns valid results.
    4. Returns a highly structured JSON response containing exact and similar matches with sources.
    """
    crop = (crop or "").strip() or "all"
    state = (state or "").strip() or "all"
    rephrased = (rephrased_query or "").strip() or query

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
    if strict_results:
        exact_task.cancel()
        retriever_task.cancel()
        print("GDB MCP: Found strict exact match. Short-circuiting lower priority searches.")
        pair = strict_results[0]
        response_data["exact_match"] = {
            "question": pair.question_text,
            "answer": pair.answer_text,
            "details": _parse_sources(pair.sources, pair.author)
        }
        return json.dumps(response_data)

    # 2. Await keyword exact search (2nd priority) - Uses REPHRASED query
    exact_results = await exact_task
    if exact_results:
        retriever_task.cancel()
        print("GDB MCP: Strict exact search empty. Found keyword exact search match. Short-circuiting vector search.")
        similar_match = {}
        for idx, pair in enumerate(exact_results[:5], 1):
            similar_match[f"similar_pair{idx}"] = {
                "question": pair.question_text,
                "answer": pair.answer_text,
                "details": _parse_sources(pair.sources, pair.author)
            }
        response_data["similar_match"] = similar_match
        return json.dumps(response_data)

    # 3. Await semantic vector retriever (3rd priority) - Uses REPHRASED query
    retriever_results = await retriever_task
    if retriever_results:
        print("GDB MCP: Exact and keyword search empty. Using vector retriever results.")
        similar_match = {}
        for idx, pair in enumerate(retriever_results[:5], 1):
            similar_match[f"similar_pair{idx}"] = {
                "question": pair.question_text,
                "answer": pair.answer_text,
                "details": _parse_sources(pair.sources, pair.author)
            }
        response_data["similar_match"] = similar_match
        return json.dumps(response_data)

    # 4. Fall back to empty structured JSON if all empty
    print("GDB MCP: No matches found across any search priority.")
    return json.dumps(response_data)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")

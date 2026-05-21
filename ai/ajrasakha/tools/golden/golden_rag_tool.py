import os
import asyncio
import json
import string
import re
from typing import List, Optional
from mcp.server.fastmcp import FastMCP

from bson import ObjectId
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel
from pymongo import AsyncMongoClient

from ajrasakha.utils import get_mongodb_vector_store, get_huggingface_embedding_model

# ==========================================
# 1. SETUP & CONFIGURATION
# ==========================================
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

# ==========================================
# 2. HELPER FUNCTIONS
# ==========================================
def _normalize_crop_state(crop: str, state: str) -> tuple[str, str]:
    """Require crop and state; use 'all' only when a value is missing after trim."""
    crop = (crop or "").strip() or "all"
    state = (state or "").strip() or "all"
    return crop, state


async def _get_answer_text_sources_and_author_name(question_id: str):
    answer_document = await answers_collection.find_one(
        {"questionId": ObjectId(question_id)},
        {"sources": 1, "authorId": 1, "answer": 1},
    )
    user_document = await users_collection.find_one(
        {"_id": ObjectId(answer_document["authorId"])}
    )
    author_name = user_document.get('firstName', 'Unknown')
    sources = answer_document.get("sources", [])
    answer = answer_document.get("answer", "")

    return answer, sources, author_name


def _parse_sources(sources_raw, author_name) -> list[dict]:
    details = []
    author = author_name or "Unknown"
    if not sources_raw:
        details.append({
            "source_name": "Database Document",
            "source_link": "",
            "author_name": author
        })
        return details

    if isinstance(sources_raw, list):
        if all(isinstance(item, str) for item in sources_raw):
            i = 0
            while i < len(sources_raw):
                link = sources_raw[i]
                name = sources_raw[i+1] if i + 1 < len(sources_raw) else "Database Document"
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
                        "source_name": s.get("source_name") or s.get("name") or "Database Document",
                        "source_link": s.get("source") or s.get("link") or s.get("url") or "",
                        "author_name": author
                    })
                elif isinstance(s, str):
                    details.append({
                        "source_name": "Database Document",
                        "source_link": s,
                        "author_name": author
                    })
    else:
        details.append({
            "source_name": "Database Document",
            "source_link": str(sources_raw),
            "author_name": author
        })
    return details

# ==========================================
# 3. CORE BUSINESS LOGIC (Standard Async Functions)
# ==========================================
# Separating logic from MCP decorators so they can be called safely by gdb_search

async def _core_retriever_search(
        query: str, crop: str, state: str, 
        season: Optional[str] = None, domain: Optional[str] = None
) -> list:
    crop, state = _normalize_crop_state(crop, state)
    filters = {"status": "closed"}
    if crop != "all":
        filters["details.crop"] = crop
    if state != "all":
        filters["details.state"] = state
    if season:
        filters["details.season"] = season
    if domain:
        filters["details.domain"] = domain

    docs = await asyncio.to_thread(
        vector_store.similarity_search_with_score, query, k=5, pre_filter=filters
    )
    
    result = []
    for doc in docs:
        document, score = doc
        answer, sources, author_name = await _get_answer_text_sources_and_author_name(
            document.metadata['_id']
        )
        result.append(QuestionAnswerPair(
            question_id=document.metadata['_id'],
            question_text=document.metadata['question'],
            answer_text=answer,
            author=author_name,
            sources=sources,
            similarity_score=score,
        ))
    return result


async def _core_strict_exact_search(query: str, crop: str, state: str) -> list:
    crop, state = _normalize_crop_state(crop, state)
    meta_filter: dict = {"status": "closed"}
    
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
        {"$match": meta_filter},
        {"$limit": 10},
        {"$project": {"_id": 1, "question": 1, "text": 1}},
    ]

    cursor = await questions_collection.aggregate(pipeline)
    raw_results = await cursor.to_list(length=10)

    if not raw_results:
        return []

    def normalize(t: str) -> str:
        return re.sub(r'\s+', ' ', t.translate(str.maketrans('', '', string.punctuation)).lower()).strip()

    norm_query = normalize(query)
    result = []
    
    for doc in raw_results:
        if normalize(doc.get("question") or doc.get("text", "")) == norm_query:
            question_id = str(doc["_id"])
            try:
                answer, sources, author_name = await _get_answer_text_sources_and_author_name(question_id)
            except Exception:
                continue

            result.append(QuestionAnswerPair(
                question_id=question_id,
                question_text=doc.get("question") or doc.get("text", ""),
                answer_text=answer,
                author=author_name,
                sources=sources,
            ))
            break 

    return result


async def _core_exact_keyword_search(
        query: str, crop: str, state: str, 
        season: Optional[str] = None, domain: Optional[str] = None, 
        min_score: float = 1.0
) -> list:
    crop, state = _normalize_crop_state(crop, state)
    meta_filter: dict = {"status": "closed"}
    
    if crop != "all":
        meta_filter["details.crop"] = crop
    if state != "all":
        meta_filter["details.state"] = state
    if season:
        meta_filter["details.season"] = season
    if domain:
        meta_filter["details.domain"] = domain

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
        {"$addFields": {"search_score": {"$meta": "searchScore"}}},
        {"$match": meta_filter},
        {"$match": {"search_score": {"$gte": min_score}}},
        {"$sort": {"search_score": -1}},
        {"$limit": 5},
        {"$project": {"_id": 1, "question": 1, "text": 1, "details": 1, "search_score": 1}},
    ]
    
    cursor = await questions_collection.aggregate(pipeline)
    raw_results = await cursor.to_list(length=5)

    if not raw_results:
        return []

    result = []
    for doc in raw_results:
        question_id = str(doc["_id"])
        try:
            answer, sources, author_name = await _get_answer_text_sources_and_author_name(question_id)
        except Exception:
            continue

        result.append(QuestionAnswerPair(
            question_id=question_id,
            question_text=doc.get("question") or doc.get("text", ""),
            answer_text=answer,
            author=author_name,
            sources=sources,
            similarity_score=doc.get("search_score"),
        ))
    return result


# ==========================================
# 4. MCP TOOLS REGISTRATION
# ==========================================

@mcp.tool()
async def golden_retriever_tool(
        query: str,
        crop: str,
        state: str,
        season: Optional[str] = None,
        domain: Optional[str] = None,
) -> list:
    """Retrieve relevant documents from the Golden dataset.
    crop and state are required on every call. Use the farmer's crop and state when known;
    use crop='all' or state='all' only as a last resort when that dimension is unknown."""
    return await _core_retriever_search(query, crop, state, season, domain)

@mcp.tool()
async def golden_strict_exact_search_tool(query: str, crop: str, state: str) -> list:
    """Search the Golden dataset for a strict character-by-character exact match on 'question'
    or 'text' fields after applying strict state and crop filters only."""
    return await _core_strict_exact_search(query, crop, state)

@mcp.tool()
async def golden_exact_search_tool(
        query: str,
        crop: str,
        state: str,
        season: Optional[str] = None,
        domain: Optional[str] = None,
        min_score: float = 1.0,
) -> list:
    """Search the Golden dataset using full-text keyword matching on the 'question'
    and 'text' fields via MongoDB Atlas Search ($search)."""
    return await _core_exact_keyword_search(query, crop, state, season, domain, min_score)

@mcp.tool()
async def get_available_states() -> dict:
    """Get all unique states available in the Golden dataset."""
    states = await questions_collection.distinct("details.state", {"status": "closed"})
    return {"success": True, "states": sorted([s for s in states if s])}

@mcp.tool()
async def get_available_crops(state: Optional[str] = None) -> dict:
    """Get all unique crops available in the Golden dataset."""
    filters = {"status": "closed"}
    if state:
        filters["details.state"] = state
    crops = await questions_collection.distinct("details.crop", filters)
    return {"success": True, "crops": sorted([c for c in crops if c])}

@mcp.tool()
async def get_available_domains(state: Optional[str] = None, crop: Optional[str] = None) -> dict:
    """Get all unique domains in the Golden dataset."""
    filters = {"status": "closed"}
    if state:
        filters["details.state"] = state
    if crop:
        filters["details.crop"] = crop
    domains = await questions_collection.distinct("details.domain", filters)
    return {"success": True, "domains": sorted([d for d in domains if d])}

@mcp.tool()
async def get_available_seasons(state: Optional[str] = None, crop: Optional[str] = None) -> dict:
    """Get all unique seasons in the Golden dataset."""
    filters = {"status": "closed"}
    if state:
        filters["details.state"] = state
    if crop:
        filters["details.crop"] = crop
    seasons = await questions_collection.distinct("details.season", filters)
    return {"success": True, "seasons": sorted([s for s in seasons if s])}

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
    Search the golden database directly using an optimized prioritized parallel execution strategy.
    Returns a highly structured JSON response containing exact and similar matches with sources.
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

    # Start all 3 underlying core logic functions concurrently in parallel
    strict_task = asyncio.create_task(
        _core_strict_exact_search(query=query, crop=crop, state=state)
    )
    exact_task = asyncio.create_task(
        _core_exact_keyword_search(query=rephrased, crop=crop, state=state, season=season, domain=domain)
    )
    retriever_task = asyncio.create_task(
        _core_retriever_search(query=rephrased, crop=crop, state=state, season=season, domain=domain)
    )

    # 1. Await strict exact search (1st priority)
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

    # 2. Await keyword exact search (2nd priority)
    exact_results = await exact_task
    if exact_results:
        retriever_task.cancel()
        print("GDB MCP: Strict exact search empty. Found keyword exact search match.")
        similar_match = {}
        for idx, pair in enumerate(exact_results[:5], 1):
            similar_match[f"similar_pair{idx}"] = {
                "question": pair.question_text,
                "answer": pair.answer_text,
                "details": _parse_sources(pair.sources, pair.author)
            }
        response_data["similar_match"] = similar_match
        return json.dumps(response_data)

    # 3. Await semantic vector retriever (3rd priority)
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

    print("GDB MCP: No matches found across any search priority.")
    return json.dumps(response_data)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")

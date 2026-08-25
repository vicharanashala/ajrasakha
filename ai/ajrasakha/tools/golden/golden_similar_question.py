"""Similar question detection API - based on embeddings only (no Gemma)."""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from bson import ObjectId
from dotenv import load_dotenv
from pydantic import BaseModel, Field

try:
    from .golden_core import (
        MONGODB_QUESTION_EMBEDDING_INDEX,
        PENDING_DUPLICATE_STATUSES,
        QuestionAnswerPair,
        _embed_text,
        _get_answer_text_sources_and_author_name,
        _truncate_text,
        questions_collection,
    )
except ImportError:
    from golden_core import (
        MONGODB_QUESTION_EMBEDDING_INDEX,
        PENDING_DUPLICATE_STATUSES,
        QuestionAnswerPair,
        _embed_text,
        _get_answer_text_sources_and_author_name,
        _truncate_text,
        questions_collection,
    )

load_dotenv()

log = logging.getLogger(__name__)


# =============================================================================
# Request/Response Models
# =============================================================================

class SimilarQuestionRequest(BaseModel):
    """Request model for similar question detection."""
    question_text: str = Field(
        ...,
        description="The question to find similar matches for",
        examples=["How to treat brown spot disease in rice?"],
    )
    top_k: int = Field(
        3,
        ge=1,
        le=10,
        description="Maximum similar questions to return (default: 3, max: 10)",
    )


class SimilarQuestionItem(BaseModel):
    """A single similar question result."""
    question_id: str = Field(..., description="MongoDB ObjectId of the question")
    question_text: str = Field(..., description="The question text")
    status: str = Field(..., description="Question status: open, delayed, in-review, closed")
    similarity_score: float = Field(..., description="Similarity score from vector search (0-1)")
    match_type: str = Field(..., description="Match type: exact or semantic")
    chosen_for_answer: bool = Field(False, description="Whether this question was selected")


class SimilarQuestionResponse(BaseModel):
    """Response for similar question detection."""
    query: str = Field(..., description="Original question text used for search")
    is_present: bool = Field(
        ...,
        description="True if an exact match was found",
    )
    present_status: Optional[str] = Field(
        None,
        description="Status of the matched question if is_present=True (open, closed, duplicate, in-review, delayed)",
    )
    present_question_id: Optional[str] = Field(
        None,
        description="Question ID of the matched question if is_present=True",
    )
    present_answer_text: Optional[str] = Field(
        None,
        description="The answer text for the matched question (only if status=closed)",
    )
    present_sources: Optional[list] = Field(
        None,
        description="Source references for the answer",
    )
    present_author: Optional[str] = Field(
        None,
        description="Author name of the answer",
    )
    exact_match_found: bool = Field(
        False,
        description="True if exact text match was found",
    )
    similar_questions: list[SimilarQuestionItem] = Field(
        default_factory=list,
        description="List of up to top_k similar questions found in database",
    )
    total_candidates_found: int = Field(0, description="Total candidates found by vector search")
    audit: dict[str, Any] = Field(
        default_factory=dict,
        description="Pipeline audit: search steps and results",
    )


# =============================================================================
# Core Functions
# =============================================================================

async def _get_question_status(question_id: str) -> str:
    """Get the status of a question by ID."""
    try:
        doc = await questions_collection.find_one({"_id": ObjectId(question_id)})
        return doc.get("status", "unknown") if doc else "unknown"
    except Exception:
        return "unknown"


async def _strict_exact_search_all_statuses(
    query: str,
) -> list[QuestionAnswerPair]:
    """
    Strict exact match search across ALL question statuses (no crop/state filter).
    
    Args:
        query: The question text to search for (normalized)
        
    Returns:
        List of QuestionAnswerPairs that match exactly
    """
    log.info(
        "_strict_exact_all_statuses: query=%r",
        _truncate_text(query, 80),
    )
    
    # Build filter for ALL statuses
    filters: dict[str, Any] = {}
    
    # Text match on question field (case-insensitive, exact)
    filters["$or"] = [
        {"question": {"$regex": f"^{re.escape(query)}$", "$options": "i"}},
        {"text": {"$regex": f"^{re.escape(query)}$", "$options": "i"}},
    ]
    
    try:
        cursor = questions_collection.find(filters).limit(5)
        docs = await cursor.to_list(length=5)
    except Exception as exc:
        log.warning("_strict_exact_all_statuses: query failed: %s: %s", type(exc).__name__, exc)
        return []
    
    result: list[QuestionAnswerPair] = []
    for doc in docs:
        question_id = str(doc["_id"])
        question_text = doc.get("question") or doc.get("text", "") or ""
        
        # Check exact match (case-insensitive)
        if question_text.lower().strip() != query.lower().strip():
            continue
        
        answer, sources, author_name = await _get_answer_text_sources_and_author_name(question_id)
        
        result.append(
            QuestionAnswerPair(
                question_id=question_id,
                question_text=question_text,
                answer_text=answer or "",
                author=author_name,
                sources=sources if sources else [],
                similarity_score=1.0,
            )
        )
        log.info("_strict_exact_all_statuses: matched question_id=%s text=%r", question_id, _truncate_text(question_text, 60))
    
    log.info("_strict_exact_all_statuses: %d exact matches", len(result))
    return result


async def _vector_search_all_statuses(
    query: str,
    top_k: int = 6,
) -> list[QuestionAnswerPair]:
    """
    Vector search across ALL question statuses (no crop/state filter).
    
    Searches both closed questions (with answers) and pending questions.
    Uses only embedding similarity - no Gemma classification.
    """
    log.info(
        "_vector_search_all_statuses: query=%r top_k=%d",
        _truncate_text(query, 80),
        top_k,
    )
    
    try:
        query_vector = await _embed_text(query)
    except Exception as exc:
        log.warning("_vector_search_all_statuses: embedding failed: %s: %s", type(exc).__name__, exc)
        return []
    
    results: list[QuestionAnswerPair] = []
    
    # Search in questions collection (closed questions with answers)
    try:
        pipeline = [
            {
                "$vectorSearch": {
                    "index": MONGODB_QUESTION_EMBEDDING_INDEX,
                    "path": "question_embedding",
                    "queryVector": query_vector,
                    "numCandidates": max(50, top_k * 10),
                    "limit": top_k * 4,
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "question": 1,
                    "text": 1,
                    "answer": 1,
                    "status": 1,
                    "details": 1,
                    "vector_score": {"$meta": "vectorSearchScore"},
                }
            },
        ]
        
        cursor = await questions_collection.aggregate(pipeline)
        docs = await cursor.to_list(length=top_k * 2)
        
        for doc in docs:
            question_id = str(doc["_id"])
            question_text = doc.get("question") or doc.get("text", "") or ""
            
            # Get answer
            answer, sources, author_name = await _get_answer_text_sources_and_author_name(question_id)
            
            vector_score = doc.get("vector_score", 0.5)
            similarity_score = float(vector_score) if vector_score else 0.5
            
            results.append(
                QuestionAnswerPair(
                    question_id=question_id,
                    question_text=question_text,
                    answer_text=answer or "",
                    author=author_name,
                    sources=sources if sources else [],
                    similarity_score=similarity_score,
                )
            )
            
            log.info(
                "_vector_all_statuses[questions]: score=%.4f question=%r status=%s",
                vector_score,
                _truncate_text(question_text, 60),
                doc.get("status", "unknown"),
            )
    except Exception as exc:
        log.warning("_vector_search_all_statuses (questions): %s: %s", type(exc).__name__, exc)
    
    # Search in pending questions for additional candidates
    try:
        pending_filter = {"status": {"$in": list(PENDING_DUPLICATE_STATUSES)}}
        
        pending_pipeline = [
            {
                "$vectorSearch": {
                    "index": MONGODB_QUESTION_EMBEDDING_INDEX,
                    "path": "question_embedding",
                    "queryVector": query_vector,
                    "numCandidates": max(50, top_k * 10),
                    "limit": top_k * 2,
                    "filter": pending_filter,
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "question": 1,
                    "text": 1,
                    "status": 1,
                    "details": 1,
                    "vector_score": {"$meta": "vectorSearchScore"},
                }
            },
        ]
        
        cursor = await questions_collection.aggregate(pending_pipeline)
        pending_docs = await cursor.to_list(length=top_k)
        
        for doc in pending_docs:
            question_id = str(doc["_id"])
            question_text = doc.get("question") or doc.get("text", "") or ""
            
            # Pending questions may not have answers yet
            # Include them anyway for similarity detection
            vector_score = doc.get("vector_score", 0.5)
            similarity_score = float(vector_score) if vector_score else 0.5
            
            results.append(
                QuestionAnswerPair(
                    question_id=question_id,
                    question_text=question_text,
                    answer_text="",  # No answer for pending questions
                    author=None,
                    sources=[],
                    similarity_score=similarity_score,
                )
            )
            
            log.info(
                "_vector_all_statuses[pending]: score=%.4f question=%r status=%s",
                vector_score,
                _truncate_text(question_text, 60),
                doc.get("status", "unknown"),
            )
    except Exception as exc:
        log.warning("_vector_search_all_statuses (pending): %s: %s", type(exc).__name__, exc)
    
    # Deduplicate by question_id and sort by score
    seen_ids = set()
    unique_results = []
    for r in results:
        if r.question_id not in seen_ids:
            seen_ids.add(r.question_id)
            unique_results.append(r)
    
    unique_results.sort(key=lambda x: x.similarity_score or 0.0, reverse=True)
    
    log.info("_vector_search_all_statuses: %d total results after dedup (top %d)", len(unique_results), top_k)
    return unique_results[:top_k]


# =============================================================================
# Main API Function (Embedding-only, no Gemma)
# =============================================================================

async def find_similar_questions(
    question_text: str,
    top_k: int = 3,
) -> dict[str, Any]:
    """
    Find similar questions in the database without crop/state filtering.
    
    This function uses ONLY embedding similarity - NO Gemma classification.
    
    Pipeline:
    1. Exact match (normalized text, case-insensitive)
    2. Vector search (top-K by embedding similarity)
    3. Return results sorted by similarity score
    
    Args:
        question_text: The question to find similar matches for
        top_k: Maximum similar questions to return
        
    Returns:
        SimilarQuestionResponse as dict
    """
    query = question_text.strip()
    
    log.info("find_similar_questions: query=%r top_k=%d", 
             _truncate_text(query, 80), top_k)
    
    audit: dict[str, Any] = {
        "query": query,
        "steps": [],
    }
    
    # Step 1: Exact match across ALL statuses (no crop/state filter)
    log.info("Step 1: Exact match search (all statuses)")
    exact_matches = await _strict_exact_search_all_statuses(
        query=query,
    )
    
    audit["steps"].append({
        "step": "exact_match",
        "results_count": len(exact_matches),
        "exact_match_found": len(exact_matches) > 0,
    })
    
    # If exact match found, return immediately
    if exact_matches:
        match = exact_matches[0]
        status = await _get_question_status(match.question_id)
        log.info("find_similar_questions: exact match found question_id=%s status=%s", match.question_id, status)

        # Get answer details if status is closed
        answer_text = None
        sources = None
        author_name = None
        if status == "closed":
            answer_text, sources, author_name = await _get_answer_text_sources_and_author_name(match.question_id)

        log.info("find_similar_questions: exact match found question_id=%s status=%s has_answer=%s",
                 match.question_id, status, bool(answer_text))
        
        return {
            "query": query,
            "is_present": True,
            "present_status": status,
            "present_question_id": match.question_id,
            "present_answer_text": answer_text,
            "present_sources": sources or [],
            "present_author": author_name,
            "exact_match_found": True,
            "similar_questions": [
                {
                    "question_id": match.question_id,
                    "question_text": match.question_text,
                    "status": status,
                    "similarity_score": 1.0,
                    "match_type": "exact",
                    "chosen_for_answer": True,
                }
            ],
            "total_candidates_found": 1,
            "audit": {**audit, "final_status": "exact_match_found"},
        }
    
    # Step 2: Vector search across ALL questions (no crop/state filter)
    log.info("Step 2: Vector search (all statuses, no crop/state filter)")
    try:
        vector_matches = await _vector_search_all_statuses(
            query=query,
            top_k=top_k,
        )
    except Exception as exc:
        log.warning("vector search failed: %s - returning empty", exc)
        vector_matches = []
    
    audit["steps"].append({
        "step": "vector_search",
        "results_count": len(vector_matches),
        "vector_results": [
            {
                "question_id": m.question_id,
                "question": _truncate_text(m.question_text, 60),
                "similarity_score": m.similarity_score,
            }
            for m in vector_matches
        ],
    })
    
    if not vector_matches:
        log.info("find_similar_questions: no matches found")
        return {
            "query": query,
            "is_present": False,
            "present_status": None,
            "present_question_id": None,
            "exact_match_found": False,
            "similar_questions": [],
            "total_candidates_found": 0,
            "audit": {**audit, "final_status": "no_matches"},
        }
    
    # Step 3: Build final response with top-K results
    # NO Gemma classification - rely purely on embedding similarity
    log.info("Step 3: Building response with top %d results (embedding-based)", top_k)
    
    similar_questions = []
    for i, match in enumerate(vector_matches[:top_k]):
        status = await _get_question_status(match.question_id)
        
        similar_questions.append({
            "question_id": match.question_id,
            "question_text": match.question_text,
            "status": status,
            "similarity_score": match.similarity_score or 0.0,
            "match_type": "semantic",
            "chosen_for_answer": (i == 0),  # First is highest similarity
        })
    
    # is_present is True only for exact matches (handled above)
    is_present = False
    present_status = None
    present_question_id = None
    
    audit["final_status"] = "completed"
    audit["is_present"] = is_present
    audit["total_candidates_found"] = len(vector_matches)
    
    log.info(
        "find_similar_questions: done is_present=%s candidates_found=%d results=%d",
        is_present,
        len(vector_matches),
        len(similar_questions),
    )
    
    return {
        "query": query,
        "is_present": is_present,
        "present_status": present_status,
        "present_question_id": present_question_id,
        "exact_match_found": False,
        "similar_questions": similar_questions,
        "total_candidates_found": len(vector_matches),
        "audit": audit,
    }
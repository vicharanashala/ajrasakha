"""Similar question detection API - based on embeddings with Gemma classification."""

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

try:
    from .gemma_question_similarity import (
        GEMMA_MODEL,
        filter_similar_questions_batch,
        classify_question_similarity,
        select_best_similar_question,
    )
except ImportError:
    from gemma_question_similarity import (
        GEMMA_MODEL,
        filter_similar_questions_batch,
        classify_question_similarity,
        select_best_similar_question,
    )

try:
    from .query_preprocessor import preprocess_query, QuerySafety, AgricultureRelevance
except ImportError:
    from query_preprocessor import preprocess_query, QuerySafety, AgricultureRelevance

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
    # Gemma classification fields
    gemma_relevance_decision: Optional[str] = Field(
        None,
        description="Gemma's relevance decision: SAME, KEEP, or REJECT",
    )
    gemma_relevance_reason: Optional[str] = Field(
        None,
        description="Gemma's reason for the relevance decision",
    )
    gemma_classification: Optional[str] = Field(
        None,
        description="Gemma's classification: SAME, RELATED, or DIFFERENT",
    )
    gemma_classification_reason: Optional[str] = Field(
        None,
        description="Gemma's reason for the classification",
    )


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
    # Pre-query rejection fields (set when query fails safety/relevance check)
    rejected: bool = Field(
        False,
        description="True if query was rejected at preprocessing step",
    )
    rejection_reason: Optional[str] = Field(
        None,
        description="Reason for rejection if rejected=True",
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
    Find similar questions using embedding-based similarity with Gemma classification.
    
    Pipeline:
    0. Preprocess query (MiniMax 2.7 safety + relevance check)
    1. Exact match check
    2. Vector search for candidates
    3. Gemma batch filtering (REJECT irrelevant)
    4. Gemma classification (SAME/RELATED/DIFFERENT)
    5. Select best match with Gemma tie-breaker
    """
    query = question_text.strip()

    log.info("find_similar_questions: query=%r top_k=%d",
             _truncate_text(query, 80), top_k)

    audit: dict[str, Any] = {
        "query": query,
        "steps": [],
        "gemma_model": GEMMA_MODEL,
    }

    # Step 0: Preprocess query (MiniMax 2.7 content safety + agriculture relevance)
    log.info("Step 0: Query preprocessing (MiniMax 2.7)")
    try:
        preprocess_result = await preprocess_query(query)
        audit["steps"].append({
            "step": "preprocess",
            "is_safe": preprocess_result.is_safe,
            "safety_decision": preprocess_result.safety_decision.value,
            "safety_reason": preprocess_result.safety_reason,
            "is_agriculture_related": preprocess_result.is_agriculture_related,
            "relevance_decision": preprocess_result.relevance_decision.value,
            "relevance_reason": preprocess_result.relevance_reason,
            "can_proceed": preprocess_result.can_proceed,
            "model_used": preprocess_result.model_used,
            "processing_time_ms": preprocess_result.processing_time_ms,
        })
        
        # If query cannot proceed, return rejection response early
        if not preprocess_result.can_proceed:
            log.info("find_similar_questions: query rejected at preprocess step")
            return {
                "query": query,
                "is_present": False,
                "present_status": None,
                "present_question_id": None,
                "present_answer_text": None,
                "present_sources": None,
                "present_author": None,
                "exact_match_found": False,
                "similar_questions": [],
                "total_candidates_found": 0,
                "rejected": True,
                "rejection_reason": preprocess_result.rejection_reason,
                "audit": {**audit, "final_status": "rejected_at_preprocess"},
            }
    except Exception as exc:
        # If preprocessing fails, log and continue (fail open)
        log.warning("query preprocessing failed: %s - continuing without preprocessing", exc)
        audit["steps"].append({
            "step": "preprocess",
            "error": str(exc),
            "can_proceed": True,  # Fail open
        })

    # Step 1: Exact match check
    log.info("Step 1: Exact match check")
    exact_match_result = await _check_exact_match(query)
    exact_match_found = exact_match_result is not None
    audit["steps"].append({
        "step": "exact_match",
        "found": exact_match_found,
        "question_id": exact_match_result.question_id if exact_match_result else None,
    })

    # Step 2: Vector search for candidates
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
            for m in vector_matches[:5]
        ],
    })

    if not vector_matches:
        log.info("find_similar_questions: no vector matches found")
        if exact_match_result:
            return await _build_exact_match_response(query, exact_match_result, audit)
        return {
            "query": query,
            "is_present": False,
            "present_status": None,
            "present_question_id": None,
            "present_answer_text": None,
            "present_sources": None,
            "present_author": None,
            "exact_match_found": exact_match_found,
            "similar_questions": [],
            "total_candidates_found": 0,
            "audit": {**audit, "final_status": "no_matches"},
        }

    # Step 3: Gemma batch filtering
    log.info("Step 3: Gemma batch filtering (%d candidates)", len(vector_matches))
    try:
        filter_results = await filter_similar_questions_batch(query, vector_matches)
        audit["steps"].append({
            "step": "gemma_filter",
            "results_count": len(filter_results),
            "filter_summary": {
                "same": sum(1 for r in filter_results if r.get("relevance_decision") == "SAME"),
                "kept": sum(1 for r in filter_results if r.get("relevance_decision") == "KEEP"),
                "rejected": sum(1 for r in filter_results if r.get("relevance_decision") == "REJECT"),
            },
        })
    except Exception as exc:
        log.warning("Gemma filter failed: %s - keeping all results", exc)
        filter_results = [
            {"relevance_decision": "KEEP", "relevance_reason": "Filter failed", "llm_parse_ok": False}
            for _ in range(len(vector_matches))
        ]
        audit["steps"].append({"step": "gemma_filter", "error": str(exc), "fallback": "kept_all"})

    # Filter out rejected results
    filtered_questions = [
        (match, filter_result)
        for match, filter_result in zip(vector_matches, filter_results)
        if filter_result.get("relevance_decision") != "REJECT"
    ]

    log.info("After Gemma filter: %d -> %d (removed %d)",
             len(vector_matches), len(filtered_questions),
             len(vector_matches) - len(filtered_questions))

    if not filtered_questions:
        log.info("find_similar_questions: all results rejected by Gemma")
        if exact_match_result:
            return await _build_exact_match_response(query, exact_match_result, audit)
        return {
            "query": query,
            "is_present": False,
            "present_status": None,
            "present_question_id": None,
            "present_answer_text": None,
            "present_sources": None,
            "present_author": None,
            "exact_match_found": exact_match_found,
            "similar_questions": [],
            "total_candidates_found": len(vector_matches),
            "audit": {**audit, "final_status": "all_rejected_by_gemma"},
        }

    # Step 4: Gemma classification
    log.info("Step 4: Gemma classification (%d candidates)", len(filtered_questions))
    classifications = []
    try:
        for match, filter_result in filtered_questions:
            cls_result = await classify_question_similarity(query, match)
            cls_result["gemma_filter_decision"] = filter_result.get("relevance_decision")
            cls_result["gemma_filter_reason"] = filter_result.get("relevance_reason")
            classifications.append(cls_result)
        audit["steps"].append({
            "step": "gemma_classify",
            "results_count": len(classifications),
            "classification_summary": {
                "same": sum(1 for c in classifications if c.get("classification") == "SAME"),
                "related": sum(1 for c in classifications if c.get("classification") == "RELATED"),
                "different": sum(1 for c in classifications if c.get("classification") == "DIFFERENT"),
            },
        })
    except Exception as exc:
        log.warning("Gemma classification failed: %s - defaulting all to RELATED", exc)
        classifications = [
            {"classification": "RELATED", "reason": "Classification failed", "llm_parse_ok": False}
            for _ in range(len(filtered_questions))
        ]
        audit["steps"].append({"step": "gemma_classify", "error": str(exc), "fallback": "default_related"})

    # Step 5: Select best match using Gemma
    log.info("Step 5: Select best match")
    matches_only = [match for match, _ in filtered_questions]
    try:
        best_match_result = await select_best_similar_question(query, matches_only, classifications)
        audit["steps"].append({
            "step": "select_best",
            "found": best_match_result is not None,
            "winning_class": best_match_result.get("winning_class") if best_match_result else None,
            "selection_method": best_match_result.get("selection_method") if best_match_result else None,
        })
    except Exception as exc:
        log.warning("Best match selection failed: %s - using top by score", exc)
        best_match_result = None
        audit["steps"].append({"step": "select_best", "error": str(exc), "fallback": "top_by_score"})

    # Build response with all results and Gemma metadata
    log.info("Building response with Gemma metadata")

    similar_questions = []
    best_question_id = None
    if best_match_result and best_match_result.get("question"):
        best_question_id = getattr(best_match_result["question"], "question_id", None)

    for ((match, filter_result), cls_result) in zip(filtered_questions, classifications):
        status = await _get_question_status(match.question_id)
        is_best = (getattr(match, "question_id", None) == best_question_id)

        similar_questions.append({
            "question_id": match.question_id,
            "question_text": match.question_text,
            "status": status,
            "similarity_score": match.similarity_score or 0.0,
            "match_type": "semantic",
            "chosen_for_answer": is_best,
            "gemma_relevance_decision": filter_result.get("relevance_decision"),
            "gemma_relevance_reason": filter_result.get("relevance_reason"),
            "gemma_classification": cls_result.get("classification"),
            "gemma_classification_reason": cls_result.get("reason"),
        })

    # Sort by Gemma relevance (SAME first, then RELATED, then DIFFERENT)
    def _gemma_sort_key(item):
        cls = item.get("gemma_classification", "DIFFERENT")
        if cls == "SAME":
            return 0
        elif cls == "RELATED":
            return 1
        return 2

    similar_questions.sort(key=_gemma_sort_key)

    # Get answer details for best result if status is closed
    top_result = similar_questions[0]
    present_status = top_result["status"]
    present_question_id = top_result["question_id"]

    present_answer_text = None
    present_sources = None
    present_author = None
    if present_status == "closed":
        log.info(
            "find_similar_questions: fetching answer for question_id=%s status=%s",
            present_question_id,
            present_status,
        )
        answer_text, sources, author_name = await _get_answer_text_sources_and_author_name(present_question_id)
        log.info(
            "find_similar_questions: answer retrieved answer_text=%s sources=%s author_name=%s",
            "YES" if answer_text else "NO",
            len(sources) if sources else 0,
            author_name,
        )
        present_answer_text = answer_text
        present_sources = sources or []
        present_author = author_name

    audit["final_status"] = "completed"
    audit["is_present"] = True
    audit["total_candidates_found"] = len(vector_matches)
    audit["after_gemma_filter"] = len(filtered_questions)

    log.info(
        "find_similar_questions: done candidates_found=%d results=%d top_score=%.4f status=%s gemma_class=%s",
        len(vector_matches),
        len(similar_questions),
        top_result["similarity_score"],
        present_status,
        top_result.get("gemma_classification"),
    )

    return {
        "query": query,
        "is_present": True,
        "present_status": present_status,
        "present_question_id": present_question_id,
        "present_answer_text": present_answer_text,
        "present_sources": present_sources or [],
        "present_author": present_author,
        "exact_match_found": False,
        "similar_questions": similar_questions,
        "total_candidates_found": len(vector_matches),
        "audit": audit,
    }


async def _check_exact_match(query: str) -> Optional[Any]:
    """Check if an exact match exists in the database."""
    normalized = re.sub(r'\s+', ' ', query.strip()).lower()
    try:
        doc = await questions_collection.find_one(
            {
                "question_text": {"$regex": f"^{re.escape(normalized)}$", "$options": "i"},
                "status": {"$nin": list(PENDING_DUPLICATE_STATUSES)},
            }
        )
        if doc:
            return type('obj', (object,), {
                'question_id': str(doc['_id']),
                'question_text': doc.get('question_text', ''),
                'status': doc.get('status', 'unknown'),
            })()
    except Exception as exc:
        log.warning("Exact match check failed: %s", exc)
    return None


async def _build_exact_match_response(query: str, exact_match: Any, audit: dict) -> dict:
    """Build response for exact match case."""
    present_question_id = exact_match.question_id
    present_status = exact_match.status

    present_answer_text = None
    present_sources = None
    present_author = None
    if present_status == "closed":
        answer_text, sources, author_name = await _get_answer_text_sources_and_author_name(present_question_id)
        present_answer_text = answer_text
        present_sources = sources or []
        present_author = author_name

    audit["final_status"] = "exact_match_found"
    audit["is_present"] = True

    return {
        "query": query,
        "is_present": True,
        "present_status": present_status,
        "present_question_id": present_question_id,
        "present_answer_text": present_answer_text,
        "present_sources": present_sources or [],
        "present_author": present_author,
        "exact_match_found": True,
        "similar_questions": [{
            "question_id": present_question_id,
            "question_text": exact_match.question_text,
            "status": present_status,
            "similarity_score": 1.0,
            "match_type": "exact",
            "chosen_for_answer": True,
            "gemma_relevance_decision": "SAME",
            "gemma_relevance_reason": "Exact match found",
            "gemma_classification": "SAME",
            "gemma_classification_reason": "Exact match",
        }],
        "total_candidates_found": 1,
        "audit": audit,
    }


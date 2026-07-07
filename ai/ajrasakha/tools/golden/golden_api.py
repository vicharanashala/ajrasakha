"""FastAPI service for Golden DB search."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

try:
    from .golden_search import gdb_search, gdb_search_v2
    from .golden_pending_duplicate import check_pending_duplicate
    from .query_refinement import refine_query_to_core_farming_question
except ImportError:
    from golden_search import gdb_search, gdb_search_v2
    from golden_pending_duplicate import check_pending_duplicate
    from query_refinement import refine_query_to_core_farming_question

app = FastAPI(
    title="AjraSakha Golden API",
    version="1.0.0",
    description=(
        "Golden DB retrieval: strict exact match, then vector RAG + Gemma classification. "
        "All steps use the planner `rephrased_query` (English, spelling/grammar cleaned)."
    ),
)


class GDBSearchRequest(BaseModel):
    rephrased_query: str = Field(
        ...,
        description=(
            "Planner English query (spelling/grammar cleaned). Used for strict exact match, "
            "vector RAG embedding, and all Gemma relevance/classification/tie-break steps."
        ),
        examples=["What causes pale tips on wheat leaves?"],
    )
    crop: str = Field(
        ...,
        description=(
            "Crop filter. Normalised to title case with underscores as spaces "
            "(e.g. bengal_gram → Bengal Gram). Matched on MongoDB details.normalised_crop. "
            "Use all to skip crop filter. If crop-filtered retrieval finds nothing, "
            "search retries without the crop filter."
        ),
        examples=["Wheat", "round_gourd", "all"],
    )
    state: str = Field(
        ...,
        description="State filter (details.state). Use all to skip state filter.",
        examples=["Uttar Pradesh", "all"],
    )
    season: Optional[str] = Field(None, description="Optional MongoDB details.season filter for RAG.")
    domain: Optional[str] = Field(None, description="Optional MongoDB details.domain filter for RAG.")


class GDBSearchResponse(BaseModel):
    rephrased_query: str = Field(
        ...,
        description="Echo of request `rephrased_query` used for the full pipeline.",
    )
    crop: str = Field(..., description="Normalised crop sent to MongoDB (title case, spaces not underscores).")
    state: str
    exact_match: dict = Field(
        default_factory=dict,
        description="Non-empty when strict exact match on `rephrased_query` succeeded (Gemma skipped).",
    )
    selected_match: Optional[dict] = Field(
        None,
        description="Single best RAG hit (SAME_INTENT or COVERED_BY_CONTEXT), else null.",
    )
    classification_audit: dict = Field(
        default_factory=dict,
        description="Full Gemma pipeline audit: relevance, classification, chosen_for_answer per candidate.",
    )


class PendingDuplicateCheckRequest(BaseModel):
    question_id: Optional[str] = Field(
        None,
        description=(
            "Load question text, crop, and state from MongoDB by ID. "
            "Excludes this question from duplicate candidates."
        ),
    )
    rephrased_query: Optional[str] = Field(
        None,
        description="Question text for duplicate check (required when question_id is omitted).",
    )
    crop: Optional[str] = Field(
        None,
        description="Crop filter (required when question_id is omitted).",
    )
    state: Optional[str] = Field(
        None,
        description="State filter (required when question_id is omitted).",
    )
    created_before: Optional[str] = Field(
        None,
        description=(
            "ISO-8601 timestamp (e.g. 2026-05-31T12:10:16.649+00:00). "
            "Only consider questions with createdAt strictly before this time. "
            "When question_id is provided and this is omitted, defaults to that question's createdAt."
        ),
        examples=["2026-05-31T12:10:16.649+00:00"],
    )

    @model_validator(mode="after")
    def validate_input_mode(self) -> "PendingDuplicateCheckRequest":
        if self.question_id:
            return self
        missing = [
            name
            for name, val in (
                ("rephrased_query", self.rephrased_query),
                ("crop", self.crop),
                ("state", self.state),
            )
            if not (val or "").strip()
        ]
        if missing:
            raise ValueError(
                f"question_id or all of rephrased_query, crop, state are required; missing: {', '.join(missing)}"
            )
        return self


class PendingDuplicateCheckResponse(BaseModel):
    is_duplicate: bool
    duplicate_question_id: Optional[str] = None
    matched_question_id: Optional[str] = None
    similarity_score: Optional[float] = Field(
        None,
        description="Vector or exact-match score for the matched duplicate (1.0 for exact).",
    )
    match_type: Optional[str] = None
    query: str
    crop: str
    state: str
    created_before: Optional[str] = Field(
        None,
        description="Echo of createdAt upper bound used for the search, if any.",
    )
    candidates_checked: list[dict[str, Any]] = Field(default_factory=list)
    audit: dict[str, Any] = Field(default_factory=dict)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post(
    "/v1/gdb/search",
    response_model=GDBSearchResponse,
    summary="Search Golden DB",
    description=(
        "**Pipeline:**\n"
        "1. **Strict exact** on `rephrased_query` (+ crop/state filters) → if hit, return `exact_match` only.\n"
        "2. Else **vector RAG** on `rephrased_query`.\n"
        "3. If both return no hits and crop is not `all`, retry steps 1–2 with `crop=all`.\n"
        "4. **Gemma** relevance + classify + select one answer using the same `rephrased_query`."
    ),
)
async def search_gdb(body: GDBSearchRequest):
    result = await gdb_search(
        rephrased_query=body.rephrased_query,
        crop=body.crop,
        state=body.state,
        season=body.season,
        domain=body.domain,
        embedding_field="embedding",  # V1 uses "embedding" field
    )
    return result


@app.post(
    "/v1/gdb/check-pending-duplicate",
    response_model=PendingDuplicateCheckResponse,
    summary="Check pending duplicate question",
    description=(
        "**Pipeline:**\n"
        "1. Resolve query/crop/state from `question_id` or request fields.\n"
        "2. **Exact** normalized text match among open/delayed/in-review AJRASAKHA/WHATSAPP questions.\n"
        "3. Else **vector top-3** + Gemma question-only duplicate verification.\n"
        "4. Return `referenceQuestionId` when the matched question has one, else matched `_id`.\n"
        "5. Optional `created_before` limits candidates to questions created earlier."
    ),
)
async def check_pending_duplicate_endpoint(body: PendingDuplicateCheckRequest):
    try:
        result = await check_pending_duplicate(
            question_id=body.question_id,
            rephrased_query=body.rephrased_query,
            crop=body.crop,
            state=body.state,
            created_before=body.created_before,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# === V2 ENDPOINTS ===
# V2 endpoints use LLM to refine the query by removing crop/state names,
# since these are filtered separately in database queries.


class GDBSearchResponseV2(BaseModel):
    original_query: str = Field(..., description="Original rephrased_query from request.")
    refined_query: str = Field(..., description="LLM-refined core farming question with crop/state removed.")
    removed_entities: list[str] = Field(default_factory=list, description="Entities removed by LLM.")
    crop: str = Field(..., description="Normalised crop sent to MongoDB.")
    state: str
    exact_match: dict = Field(default_factory=dict)
    selected_match: Optional[dict] = Field(None)
    classification_audit: dict = Field(default_factory=dict)


class GDBSearchResponseV2Combined(BaseModel):
    """V2 Combined search response with full retrieval metadata."""
    original_query: str = Field(..., description="Original rephrased_query from request.")
    refined_query: str = Field(..., description="LLM-refined core farming question with crop/state removed.")
    removed_entities: list[str] = Field(default_factory=list, description="Entities removed by LLM.")
    keywords_extracted: list[str] = Field(default_factory=list, description="Keywords extracted for BM25 search.")
    crop: str = Field(..., description="Normalised crop sent to MongoDB.")
    state: str
    exact_match: dict = Field(default_factory=dict)
    selected_match: Optional[dict] = Field(None)
    classification_audit: dict = Field(default_factory=dict)
    v2_metadata: "V2MetadataCombined" = Field(default_factory=dict, description="V2-specific metadata including search breakdown.")


class V2MetadataCombined(BaseModel):
    """V2 metadata structure showing all sources each question was found in."""
    keywords_extracted: list[str] = Field(default_factory=list, description="Keywords extracted for BM25 search.")
    question_semantic_results: int = Field(0, description="Count of unique questions from question semantic search")
    answer_semantic_results: int = Field(0, description="Count of unique questions from answer semantic search")
    keyword_results: int = Field(0, description="Count of unique questions from keyword/BM25 search")
    total_candidates: int = Field(0, description="Total unique questions after deduplication")
    retrieval_sources: dict[str, list[str]] = Field(
        default_factory=dict,
        description="Map of question_id to list of all sources it was found in (question_semantic, answer_semantic, keyword)"
    )


class PendingDuplicateCheckResponseV2(BaseModel):
    original_query: str = Field(..., description="Original rephrased_query from request.")
    refined_query: str = Field(..., description="LLM-refined core farming question with crop/state removed.")
    removed_entities: list[str] = Field(default_factory=list)
    is_duplicate: bool
    duplicate_question_id: Optional[str] = None
    matched_question_id: Optional[str] = None
    similarity_score: Optional[float] = Field(None)
    match_type: Optional[str] = None
    crop: str
    state: str
    created_before: Optional[str] = Field(None)
    candidates_checked: list[dict[str, Any]] = Field(default_factory=list)
    audit: dict[str, Any] = Field(default_factory=dict)


@app.post(
    "/v2/gdb/search",
    response_model=GDBSearchResponseV2,
    summary="Search Golden DB V2 (with LLM query refinement)",
    description=(
        "**Pipeline:**\n"
        "1. **LLM refinement**: Remove crop/state names from query to get core farming question.\n"
        "2. **Strict exact** on refined query (+ crop/state filters) → if hit, return `exact_match` only.\n"
        "3. Else **vector RAG** on refined query.\n"
        "4. If both return no hits and crop is not `all`, retry steps 1–3 with `crop=all`.\n"
        "5. **Gemma** relevance + classify + select one answer.\n"
        "6. Response includes both original and refined query for transparency."
    ),
)
async def search_gdb_v2(body: GDBSearchRequest):
    # Step 1: LLM refine the query
    refinement = await refine_query_to_core_farming_question(
        original_query=body.rephrased_query,
        crop=body.crop,
        state=body.state,
    )

    # Step 2: Use refined query for search (with dual search enabled for v2)
    result = await gdb_search(
        rephrased_query=refinement.refined_query,
        crop=body.crop,
        state=body.state,
        season=body.season,
        domain=body.domain,
        use_dual_search=True,
        embedding_field="question_embedding",
        original_query=body.rephrased_query,  # Use original query for LLM scoring
    )

    # Step 3: Wrap in V2 response with refinement metadata
    return GDBSearchResponseV2(
        original_query=body.rephrased_query,
        refined_query=refinement.refined_query,
        removed_entities=refinement.removed_entities,
        crop=result.get("crop", body.crop),
        state=result.get("state", body.state),
        exact_match=result.get("exact_match", {}),
        selected_match=result.get("selected_match"),
        classification_audit=result.get("classification_audit", {}),
    )


@app.post(
    "/v2/gdb/search-combined",
    response_model=GDBSearchResponseV2Combined,
    summary="Search Golden DB V2 Combined (3.1-3.5 Pipeline)",
    description=(
        "**V2 Combined Search Pipeline:**\n"
        "3.1 **Keyword Extraction**: Extract key terms from refined query for BM25.\n"
        "3.2 **BM25 Search**: MongoDB Atlas Search with keyword matching.\n"
        "3.3 **Combine All 8 Pairs**: 3 Q-semantic + 2 A-semantic + 3 BM25 = 8 total.\n"
        "3.4 **LLM Scoring**: Score all 8 pairs for relevance with numerical scores.\n"
        "3.5 **Final Selection**: Select highest-scoring pair for answer generation.\n"
        "\n"
        "**First Step**: LLM refinement (same as /v2/gdb/search).\n"
        "**Returns**: Extended response with v2_metadata showing search breakdown."
    ),
)
async def search_gdb_v2_combined(body: GDBSearchRequest):
    """
    V2 Combined search: combines semantic + BM25 with scoring and ranking.
    
    This endpoint implements the full 3.1-3.5 pipeline:
    - 0: Strict exact match on original query (before refinement)
    - 3.1: Extract keywords from refined query
    - 3.2: Run BM25 search alongside semantic search
    - 3.3: Combine all 8 pairs (3 Q + 2 A + 3 BM25)
    - 3.4: LLM relevance scoring with numerical scores
    - 3.5: Select highest-scoring pair
    """
    from golden_search import gdb_search  # Import here for strict_exact
    
    # Step 0: Strict exact match on ORIGINAL query (before refinement)
    # This ensures we catch exact matches even when they include crop/state names
    strict_result = await gdb_search(
        rephrased_query=body.rephrased_query,
        crop=body.crop,
        state=body.state,
        season=body.season,
        domain=body.domain,
        use_dual_search=False,
        embedding_field="question_embedding",
    )
    
    # If strict exact match found, return immediately
    if strict_result.get("exact_match"):
        return GDBSearchResponseV2Combined(
            original_query=body.rephrased_query,
            refined_query=body.rephrased_query,  # No refinement needed
            removed_entities=[],
            keywords_extracted=[],
            crop=strict_result.get("crop", body.crop),
            state=strict_result.get("state", body.state),
            exact_match=strict_result.get("exact_match", {}),
            selected_match=None,
            classification_audit=strict_result.get("classification_audit", {}),
            v2_metadata={
                "strict_exact_match": True,
                "question_semantic_results": 0,
                "answer_semantic_results": 0,
                "keyword_results": 0,
                "total_candidates": 1,
            },
        )
    
    # Step 1: LLM refine the query (only if no strict match)
    refinement = await refine_query_to_core_farming_question(
        original_query=body.rephrased_query,
        crop=body.crop,
        state=body.state,
    )

    # Step 2: Run combined search (semantic + BM25, 8 pairs, scoring)
    result = await gdb_search_v2(
        rephrased_query=refinement.refined_query,
        crop=body.crop,
        state=body.state,
        season=body.season,
        domain=body.domain,
        use_dual_search=True,
        embedding_field="question_embedding",
        original_query=body.rephrased_query,
    )

    # Step 3: Wrap in V2 Combined response
    return GDBSearchResponseV2Combined(
        original_query=body.rephrased_query,
        refined_query=refinement.refined_query,
        removed_entities=refinement.removed_entities,
        keywords_extracted=result.get("v2_metadata", {}).get("keywords_extracted", []),
        crop=result.get("crop", body.crop),
        state=result.get("state", body.state),
        exact_match=result.get("exact_match", {}),
        selected_match=result.get("selected_match"),
        classification_audit=result.get("classification_audit", {}),
        v2_metadata=result.get("v2_metadata", {}),
    )


@app.post(
    "/v2/gdb/check-pending-duplicate",
    response_model=PendingDuplicateCheckResponseV2,
    summary="Check pending duplicate question V2 (with LLM query refinement)",
    description=(
        "**Pipeline:**\n"
        "1. Resolve query/crop/state from `question_id` or request fields.\n"
        "2. **LLM refinement**: Remove crop/state names from query.\n"
        "3. **Exact** normalized text match using refined query.\n"
        "4. Else **vector top-3** + Gemma question-only duplicate verification.\n"
        "5. Return `referenceQuestionId` when the matched question has one, else matched `_id`.\n"
        "6. Optional `created_before` limits candidates to questions created earlier."
    ),
)
async def check_pending_duplicate_endpoint_v2(body: PendingDuplicateCheckRequest):
    try:
        # Resolve query/crop/state
        query = body.rephrased_query
        crop = body.crop
        state = body.state

        if body.question_id:
            # Load from MongoDB by ID (function is in golden_core.py, imported via golden_pending_duplicate)
            from .golden_core import get_question_by_id
            doc = await get_question_by_id(body.question_id)
            if not doc:
                raise LookupError(f"Question not found: {body.question_id}")
            query = doc.get("question", "") or doc.get("text", "") or ""
            details = doc.get("details") or {}
            crop = details.get("crop") or details.get("normalised_crop") or "all"
            state = details.get("state", "all")
            if body.created_before is None and doc.get("createdAt"):
                body.created_before = (
                    doc["createdAt"].isoformat() if hasattr(doc["createdAt"], "isoformat") else str(doc["createdAt"])
                )

        # LLM refine the query
        refinement = await refine_query_to_core_farming_question(
            original_query=query or "",
            crop=crop or "all",
            state=state or "all",
        )

        # Check for duplicates using refined query
        result = await check_pending_duplicate(
            question_id=body.question_id,
            rephrased_query=refinement.refined_query,
            crop=crop,
            state=state,
            created_before=body.created_before,
        )

        return PendingDuplicateCheckResponseV2(
            original_query=query,
            refined_query=refinement.refined_query,
            removed_entities=refinement.removed_entities,
            is_duplicate=result.get("is_duplicate", False),
            duplicate_question_id=result.get("duplicate_question_id"),
            matched_question_id=result.get("matched_question_id"),
            similarity_score=result.get("similarity_score"),
            match_type=result.get("match_type"),
            crop=crop or "all",
            state=state or "all",
            created_before=body.created_before,
            candidates_checked=result.get("candidates_checked", []),
            audit=result.get("audit", {}),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

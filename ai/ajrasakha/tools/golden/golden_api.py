"""FastAPI service for Golden DB search."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

try:
    from .golden_search import gdb_search
    from .golden_pending_duplicate import check_pending_duplicate
except ImportError:
    from golden_search import gdb_search
    from golden_pending_duplicate import check_pending_duplicate

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
    return result

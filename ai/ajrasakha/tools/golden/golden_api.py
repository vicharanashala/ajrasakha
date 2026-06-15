"""FastAPI service for Golden DB search."""

from __future__ import annotations

from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

try:
    from .golden_search import gdb_search
except ImportError:
    from golden_search import gdb_search

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

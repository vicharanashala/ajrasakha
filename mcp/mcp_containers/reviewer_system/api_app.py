"""FastAPI REST server for Reviewer System."""

from __future__ import annotations

from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Body, FastAPI, Query
from pydantic import BaseModel, Field

from reviewer_mcp import (
    get_available_states_for_reviewer_dataset,
    get_context_from_reviewer_dataset,
    get_crops_by_state_for_reviwer_dataset,
    upload_question_to_reviewer_system,
)

load_dotenv()


def _mcp_fn(tool):
    """Call underlying async function behind a FastMCP @mcp.tool wrapper."""
    return tool.fn if hasattr(tool, "fn") else tool


app = FastAPI(
    title="Reviewer System API",
    version="1.0.0",
    description=(
        "REST access to reviewer upload and retrieval. "
        "FastMCP runs as a separate process (see run.sh); default MCP port REVIEWER_MCP_PORT."
    ),
)


class UploadQuestionRequest(BaseModel):
    question: str
    original_question: str
    state: str
    english_crop_name: str
    domain: str
    crop_name: str
    district: Optional[str] = None
    season: Optional[str] = None


class ReviewerContextRequest(BaseModel):
    query: str
    state: Optional[str] = None
    crop: Optional[str] = None


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "reviewer-system", "component": "fastapi"}


@app.post("/reviewer/upload", tags=["reviewer"])
async def reviewer_upload(body: UploadQuestionRequest = Body(...)):
    """Same behaviour as upload_question_to_reviewer_system MCP tool."""
    return await _mcp_fn(upload_question_to_reviewer_system)(
        question=body.question,
        original_question=body.original_question,
        state=body.state,
        english_crop_name=body.english_crop_name,
        domain=body.domain,
        crop_name=body.crop_name,
        district=body.district,
        season=body.season,
    )


@app.get("/reviewer/states", tags=["reviewer"])
async def reviewer_states():
    return await _mcp_fn(get_available_states_for_reviewer_dataset)()


@app.get("/reviewer/crops", tags=["reviewer"])
async def reviewer_crops(state: str = Query(..., description="State name or code")):
    return await _mcp_fn(get_crops_by_state_for_reviwer_dataset)(state)


@app.get("/reviewer/context", tags=["reviewer"])
async def reviewer_context_get(
    query: str = Query(...),
    state: Optional[str] = Query(None),
    crop: Optional[str] = Query(None),
):
    return await _mcp_fn(get_context_from_reviewer_dataset)(
        query=query, state=state, crop=crop
    )


@app.post("/reviewer/context", tags=["reviewer"])
async def reviewer_context_post(body: ReviewerContextRequest = Body(...)):
    return await _mcp_fn(get_context_from_reviewer_dataset)(
        query=body.query, state=body.state, crop=body.crop
    )

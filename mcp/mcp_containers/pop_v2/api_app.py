"""FastAPI REST server for POP v2."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Body, FastAPI, Query
from pydantic import BaseModel, Field

from common import ensure_pop_started
from models import POPContextResponse
from pop_service import (
    get_context_from_package_of_practices,
    get_pop_states_and_crops_export,
)

load_dotenv()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_pop_started()
    yield


app = FastAPI(
    title="Ajrasakha POP v2 API",
    version="1.0.0",
    lifespan=lifespan,
    description=(
        "REST access to Package of Practices retrieval. "
        "FastMCP runs as a separate process (see run.sh); default MCP port POP_MCP_PORT."
    ),
)


class PopContextRequest(BaseModel):
    query: str = Field(..., description="User agricultural query")
    state: str = Field(..., description="Indian state name")
    crop: str = Field(..., description="Crop name for the state")


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "ajrasakha-pop-v2", "component": "fastapi"}


@app.get("/pop/states-and-crops", tags=["pop"])
def pop_states_and_crops():
    """Same payload as get_pop_states_and_crops MCP tool."""
    return get_pop_states_and_crops_export()


@app.get(
    "/pop/context",
    tags=["pop"],
    response_model=POPContextResponse,
    summary="Retrieve POP context (query params)",
)
async def pop_context_get(
    query: str = Query(...),
    state: str = Query(...),
    crop: str = Query(...),
):
    return await get_context_from_package_of_practices(query, state, crop)


@app.post(
    "/pop/context",
    tags=["pop"],
    response_model=POPContextResponse,
    summary="Retrieve POP context (JSON body)",
)
async def pop_context_post(body: PopContextRequest = Body(...)):
    return await get_context_from_package_of_practices(body.query, body.state, body.crop)

from __future__ import annotations

import logging
import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

from answer_service import generate_pop_answer
from models import AnsGenPopResponse, GenerateRequest
from pop_client import PopV2ClientError, check_pop_v2_health

load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("ans_gen_pop")

app = FastAPI(
    title="Ajrasakha PoP Answer Generation API",
    version="1.0.0",
    description=(
        "Retrieves Package of Practices context from pop_v2, filters with LLM, "
        "and generates a farmer-facing answer."
    ),
)


@app.get("/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "service": "ans-gen-pop",
        "pop_v2_api_url": os.getenv("POP_V2_API_URL", "http://localhost:9003"),
    }


@app.get("/health/ready", tags=["meta"])
async def health_ready():
    """Readiness: ans_gen_pop is up and pop_v2 is reachable."""
    pop_status = await check_pop_v2_health()
    if not pop_status.get("reachable"):
        raise HTTPException(
            status_code=503,
            detail=pop_status,
        )
    return {"status": "ready", "service": "ans-gen-pop", "pop_v2": pop_status}


@app.post(
    "/generate",
    tags=["pop"],
    response_model=AnsGenPopResponse,
    summary="Generate answer from PoP data",
)
async def generate(body: GenerateRequest):
    query = (body.query or "").strip()
    state = (body.state or "").strip()
    crop = (body.crop or "").strip()
    if not query or not state or not crop:
        raise HTTPException(
            status_code=400,
            detail="query, state, and crop are required non-empty strings",
        )

    try:
        return await generate_pop_answer(query, state, crop)
    except PopV2ClientError as exc:
        log.error("pop_v2 unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("generate failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc


if __name__ == "__main__":
    host = os.getenv("ANS_GEN_POP_HOST", "0.0.0.0")
    port = int(os.getenv("ANS_GEN_POP_PORT", "9016"))
    uvicorn.run("main:app", host=host, port=port, reload=False)

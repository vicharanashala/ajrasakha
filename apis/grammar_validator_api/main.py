"""
Grammar Validator API

Validates text for grammatical correctness and English language compliance
using a locally deployed MiniMax model.
"""

from __future__ import annotations

import logging
import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from llm_client import GrammarValidatorClient, GrammarValidatorClientError
from models import GrammarValidationRequest, GrammarValidationResponse

load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("grammar_validator")

app = FastAPI(
    title="Grammar Validator API",
    version="1.0.0",
    description=(
        "Validates text for grammatical correctness and English language compliance. "
        "Returns validation status and corrected suggestions when applicable."
    ),
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize LLM client
llm_client = GrammarValidatorClient()


@app.get("/health", tags=["meta"])
def health():
    """Basic health check endpoint."""
    return {
        "status": "ok",
        "service": "grammar-validator",
        "version": "1.0.0",
    }


@app.get("/health/ready", tags=["meta"])
async def health_ready():
    """
    Readiness check that verifies the LLM service is reachable.
    """
    try:
        is_ready = await llm_client.check_health()
        if not is_ready:
            raise HTTPException(
                status_code=503,
                detail={
                    "status": "not_ready",
                    "message": "LLM service is not reachable",
                    "llm_url": llm_client.base_url,
                },
            )
        return {
            "status": "ready",
            "service": "grammar-validator",
            "llm_service": "reachable",
            "llm_url": llm_client.base_url,
        }
    except GrammarValidatorClientError as exc:
        log.error("LLM health check failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "message": str(exc),
                "llm_url": llm_client.base_url,
            },
        ) from exc


@app.post(
    "/validate",
    tags=["grammar"],
    response_model=GrammarValidationResponse,
    summary="Validate grammar and language",
)
async def validate_grammar(body: GrammarValidationRequest):
    """
    Validate text for grammatical correctness and English language compliance.

    - **text**: The text to validate (required)
    - **maxSuggestions**: Maximum number of correction suggestions to return (optional, default 3)

    Returns:
    - **isValid**: Boolean indicating if the text is grammatically correct and in English
    - **suggestions**: List of corrected suggestions when text is not valid
    - **originalText**: The original input text
    - **validationErrors**: Detailed list of grammar/language issues found
    """
    text = (body.text or "").strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="text is a required non-empty string",
        )

    try:
        result = await llm_client.validate_grammar(
            text=text,
            max_suggestions=body.maxSuggestions,
        )
        return result
    except GrammarValidatorClientError as exc:
        log.error("Grammar validation failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail={
                "message": "LLM service error",
                "error": str(exc),
                "llm_url": llm_client.base_url,
            },
        ) from exc
    except Exception as exc:
        log.exception("Unexpected error during validation")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Internal server error",
                "error": str(exc),
            },
        ) from exc


if __name__ == "__main__":
    host = os.getenv("GRAMMAR_VALIDATOR_HOST", "0.0.0.0")
    port = int(os.getenv("GRAMMAR_VALIDATOR_PORT", "8002"))
    uvicorn.run("main:app", host=host, port=port, reload=False)
from __future__ import annotations

import logging
import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

from .gap_service import (
    analyze_query,
    analyze_batch,
    generate_weekly_report,
    get_statistics,
)
from .models import (
    AnalyzeRequest,
    AnalyzeResponse,
    BatchAnalyzeRequest,
    BatchAnalyzeResponse,
    WeeklyGapReport,
    GapStatistics,
)

load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

log = logging.getLogger("gdb_gap_detector")

app = FastAPI(
    title="Ajrasakha GDB Gap Detector",
    version="1.0.0",
    description=(
        "Detects unanswered farmer queries, "
        "clusters knowledge gaps, "
        "and generates reviewer reports."
    ),
)


@app.get("/health", tags=["meta"])
async def health():
    return {
        "status": "ok",
        "service": "gdb-gap-detector",
        "version": "1.0.0",
    }


@app.get("/health/ready", tags=["meta"])
async def health_ready():
    """
    Readiness probe.

    Later this can verify:
    - MongoDB connectivity
    - Embedding model availability
    - Vector index availability
    """

    return {
        "status": "ready",
        "service": "gdb-gap-detector",
    }


@app.post(
    "/analyze",
    summary="Analyze unanswered farmer query",
    response_description="Gap analysis result",
)
async def analyze(body: AnalyzeRequest):

    if not body.question.strip():
        raise HTTPException(
            status_code=400,
            detail="question must not be empty",
        )

    try:
        return await analyze_query(body)

    except Exception as exc:
        log.exception("Gap analysis failed")

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@app.post(
    "/analyze/batch",
    tags=["gap-detector"],
    response_model=BatchAnalyzeResponse,
    summary="Analyze multiple unanswered queries",
)
async def analyze_multiple(body: BatchAnalyzeRequest):

    if len(body.queries) == 0:
        raise HTTPException(
            status_code=400,
            detail="queries cannot be empty",
        )

    try:
        return await analyze_batch(body)

    except Exception as exc:
        log.exception("Batch gap analysis failed")

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@app.get(
    "/statistics",
    tags=["analytics"],
    response_model=GapStatistics,
)
async def statistics():

    try:
        return await get_statistics()

    except Exception as exc:
        log.exception("Statistics generation failed")

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@app.get(
    "/report",
    tags=["reports"],
    response_model=WeeklyGapReport,
)
async def weekly_report():

    try:
        return await generate_weekly_report()

    except Exception as exc:
        log.exception("Weekly report generation failed")

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


if __name__ == "__main__":
    host = os.getenv("GAP_DETECTOR_HOST", "0.0.0.0")
    port = int(os.getenv("GAP_DETECTOR_PORT", "9020"))

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
    )
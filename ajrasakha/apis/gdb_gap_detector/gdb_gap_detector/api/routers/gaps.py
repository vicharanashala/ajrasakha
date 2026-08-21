import logging
from typing import Any
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from gdb_gap_detector.core import get_database, settings
from gdb_gap_detector.models import GapReport, ScoredCluster
from gdb_gap_detector.pipeline.reporter import generate_markdown_report
from gdb_gap_detector.services import run_full_pipeline

logger = logging.getLogger("gdb_gap_detector.api.routers.gaps")
router = APIRouter(prefix="/api/v1", tags=["Gaps & Reports"])


@router.get("/gap-report", response_model=GapReport)
async def get_gap_report(
    period_days: int = Query(default=30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> GapReport:
    """Execute pipeline and return JSON GapReport."""
    return await run_full_pipeline(db, period_days=period_days, write_to_db=False)


@router.get("/gap-report/markdown", response_class=PlainTextResponse)
async def get_gap_report_markdown(
    period_days: int = Query(default=30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> str:
    """Execute pipeline and return human-readable natural language Markdown report."""
    report = await run_full_pipeline(db, period_days=period_days, write_to_db=False)
    return generate_markdown_report(report)


@router.get("/clusters", response_model=list[ScoredCluster])
async def get_clusters(
    period_days: int = Query(default=30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[ScoredCluster]:
    """Execute pipeline and return top gap clusters list."""
    report = await run_full_pipeline(db, period_days=period_days, write_to_db=False)
    return report.top_gaps


@router.get("/gap-reports/history", response_model=list[dict[str, Any]])
async def get_historical_reports(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict[str, Any]]:
    """List historical gap reports from MongoDB gap_reports collection."""
    collection = db[settings.gap_reports_collection]
    cursor = collection.find({}).sort("generated_at", -1).limit(limit)

    reports = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
        reports.append(doc)
    return reports


@router.get("/gap-reports/{report_id}", response_model=dict[str, Any])
async def get_historical_report_by_id(
    report_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict[str, Any]:
    """Get a specific historical gap report by ID."""
    collection = db[settings.gap_reports_collection]
    try:
        query = {"_id": ObjectId(report_id)}
    except Exception:
        query = {"_id": report_id}

    doc = await collection.find_one(query)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Report '{report_id}' not found.")

    doc["id"] = str(doc["_id"])
    del doc["_id"]
    return doc


@router.post("/run-now", response_model=GapReport)
async def trigger_run_now(
    period_days: int = Query(default=30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> GapReport:
    """Trigger pipeline execution on-demand and write report to MongoDB."""
    return await run_full_pipeline(db, period_days=period_days, write_to_db=True)

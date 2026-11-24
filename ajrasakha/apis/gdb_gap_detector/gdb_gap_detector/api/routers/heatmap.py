from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from gdb_gap_detector.core import get_database, settings
from gdb_gap_detector.models import CoverageCell, GdbEntry
from gdb_gap_detector.pipeline.coverage import calculate_coverage_heatmap
from gdb_gap_detector.pipeline.extractor import extract_disclaimer_queries

router = APIRouter(prefix="/api/v1", tags=["Heatmap"])


@router.get("/heatmap", response_model=list[CoverageCell])
async def get_heatmap(
    period_days: int = Query(default=30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[CoverageCell]:
    """Return coverage heatmap cells array for (domain, state) combinations."""
    disclaimer_logs, _ = await extract_disclaimer_queries(db, period_days=period_days)

    gdb_cursor = db[settings.gdb_entries_collection].find({})
    gdb_entries = [
        GdbEntry(**{**doc, "_id": str(doc["_id"])}) async for doc in gdb_cursor
    ]

    heatmap_cells, _ = calculate_coverage_heatmap(gdb_entries, disclaimer_logs)
    return heatmap_cells

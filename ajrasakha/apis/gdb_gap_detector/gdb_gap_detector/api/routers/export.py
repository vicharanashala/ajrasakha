import csv
import io
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from gdb_gap_detector.core import get_database
from gdb_gap_detector.services import run_full_pipeline

router = APIRouter(prefix="/api/v1", tags=["Export"])


@router.get("/export/csv")
async def export_gaps_csv(
    period_days: int = Query(default=30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> StreamingResponse:
    """Download top coverage gap recommendations as a CSV file."""
    report = await run_full_pipeline(db, period_days=period_days, write_to_db=False)

    output = io.StringIO()
    writer = csv.writer(output)

    # CSV Header
    writer.writerow([
        "Rank", "Priority Level", "Priority Score", "Cluster Topic",
        "Farmer Demand", "Triage Status", "Trend Status", "Domains",
        "States", "Sample Question", "Recommended Action"
    ])

    for idx, gap in enumerate(report.top_gaps, 1):
        sample = gap.sample_queries[0] if gap.sample_queries else ""
        writer.writerow([
            idx,
            gap.priority_level,
            gap.priority_score,
            gap.cluster_name,
            gap.farmer_demand,
            gap.triage_status,
            gap.trend_status,
            "; ".join(gap.domains),
            "; ".join(gap.states),
            sample,
            gap.recommended_action
        ])

    output.seek(0)
    filename = f"gdb_gap_report_{period_days}d.csv"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)

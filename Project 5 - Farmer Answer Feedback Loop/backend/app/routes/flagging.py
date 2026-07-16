"""
Flagging routes — manage the auto-flagging pipeline and reviewer queue.
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.services.flagging_service import run_full_flagging_pipeline
from datetime import datetime, timezone
from typing import Optional

router = APIRouter(prefix="/flagging", tags=["Flagging Pipeline"])


@router.get("/flagged", summary="Get all flagged GDB entries")
async def get_flagged_entries(
    status: Optional[str] = None,
    domain: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Returns all flagged GDB entries, enriched with question text from gdb_entries."""
    query = {}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$in": ["flagged", "under_review"]}
    if domain:
        query["domain"] = domain

    cursor = db.flagged_entries.find(query).sort("priority_score", -1)
    flagged = await cursor.to_list(500)

    # Enrich with GDB entry question text
    results = []
    for f in flagged:
        gdb_id = f.get("gdb_entry_id")
        gdb_entry = await db.gdb_entries.find_one({"_id": gdb_id}, {"question": 1, "answer": 1})

        results.append({
            "id": str(f.get("_id", "")),
            "gdb_entry_id": gdb_id,
            "domain": f.get("domain"),
            "language": f.get("language"),
            "total_responses": f.get("total_responses", 0),
            "helpful_count": f.get("helpful_count", 0),
            "not_helpful_count": f.get("not_helpful_count", 0),
            "helpfulness_score": f.get("helpfulness_score", 0),
            "priority_score": f.get("priority_score", 0),
            "status": f.get("status"),
            "flagged_at": f.get("flagged_at", "").isoformat() if hasattr(f.get("flagged_at"), "isoformat") else str(f.get("flagged_at", "")),
            "last_feedback_at": f.get("last_feedback_at", "").isoformat() if hasattr(f.get("last_feedback_at"), "isoformat") else str(f.get("last_feedback_at", "")),
            "review_notes": f.get("review_notes"),
            "question": gdb_entry.get("question", "") if gdb_entry else "",
            "answer": gdb_entry.get("answer", "") if gdb_entry else "",
        })

    return {"total": len(results), "data": results}


@router.post("/run", summary="Run full flagging pipeline scan")
async def run_flagging_pipeline(db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Scans all GDB entries and flags any that cross the threshold.
    Safe to run multiple times (idempotent).
    """
    result = await run_full_flagging_pipeline(db)
    return {
        "message": "Flagging pipeline completed",
        **result,
    }


@router.patch("/{gdb_entry_id}/resolve", summary="Resolve a flagged entry")
async def resolve_flagged_entry(
    gdb_entry_id: str,
    review_notes: Optional[str] = Body(None, embed=True),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Mark a flagged GDB entry as resolved (after the agri team has improved it)."""
    existing = await db.flagged_entries.find_one({"gdb_entry_id": gdb_entry_id})
    if not existing:
        raise HTTPException(status_code=404, detail=f"No flagged entry found for '{gdb_entry_id}'")

    await db.flagged_entries.update_one(
        {"gdb_entry_id": gdb_entry_id},
        {"$set": {
            "status": "resolved",
            "review_notes": review_notes,
            "resolved_at": datetime.now(timezone.utc),
        }}
    )
    await db.gdb_entries.update_one(
        {"_id": gdb_entry_id},
        {"$set": {"is_flagged": False}}
    )

    return {"message": f"Entry '{gdb_entry_id}' marked as resolved", "gdb_entry_id": gdb_entry_id}


@router.patch("/{gdb_entry_id}/status", summary="Update flag status")
async def update_flag_status(
    gdb_entry_id: str,
    new_status: str = Body(..., embed=True),
    review_notes: Optional[str] = Body(None, embed=True),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update the status of a flagged entry (flagged → under_review → resolved)."""
    valid_statuses = {"flagged", "under_review", "resolved"}
    if new_status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"Status must be one of: {valid_statuses}")

    result = await db.flagged_entries.update_one(
        {"gdb_entry_id": gdb_entry_id},
        {"$set": {
            "status": new_status,
            "review_notes": review_notes,
            "updated_at": datetime.now(timezone.utc),
        }}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Flagged entry not found")

    if new_status == "resolved":
        await db.gdb_entries.update_one(
            {"_id": gdb_entry_id},
            {"$set": {"is_flagged": False}}
        )

    return {"message": f"Status updated to '{new_status}'", "gdb_entry_id": gdb_entry_id}

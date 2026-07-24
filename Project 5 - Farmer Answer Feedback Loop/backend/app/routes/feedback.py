"""
Feedback routes — submit, list, and query farmer feedback records.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.models.feedback import FeedbackCreate
from app.services.flagging_service import update_gdb_helpfulness, check_and_flag_entry
from datetime import datetime, timezone
from typing import Optional
import uuid

router = APIRouter(prefix="/feedback", tags=["Feedback"])


@router.post("/submit", summary="Submit farmer feedback manually")
async def submit_feedback(
    payload: FeedbackCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Submit a feedback record directly (for testing / admin use)."""
    # Verify GDB entry exists
    gdb_entry = await db.gdb_entries.find_one({"_id": payload.gdb_entry_id})
    if not gdb_entry:
        raise HTTPException(status_code=404, detail=f"GDB entry '{payload.gdb_entry_id}' not found")

    if payload.response not in ("1", "2"):
        raise HTTPException(status_code=422, detail="Response must be '1' (helpful) or '2' (not helpful)")

    fb_id = f"fb_{payload.gdb_entry_id}_{uuid.uuid4().hex[:8]}"
    fb_doc = {
        "_id": fb_id,
        "gdb_entry_id": payload.gdb_entry_id,
        "farmer_id": payload.farmer_id,
        "message_id": str(uuid.uuid4()),
        "response": payload.response,
        "state": payload.state or gdb_entry.get("state"),
        "language": payload.language or gdb_entry.get("language"),
        "domain": payload.domain or gdb_entry.get("domain"),
        "timestamp": datetime.now(timezone.utc),
        "status": "captured",
    }

    await db.feedback.insert_one(fb_doc)
    await update_gdb_helpfulness(db, payload.gdb_entry_id)
    await check_and_flag_entry(db, payload.gdb_entry_id)

    updated = await db.gdb_entries.find_one({"_id": payload.gdb_entry_id})

    return {
        "feedback_id": fb_id,
        "gdb_entry_id": payload.gdb_entry_id,
        "response": "helpful" if payload.response == "1" else "not_helpful",
        "updated_score": updated.get("helpfulness_score", 0) if updated else 0,
        "total_responses": updated.get("total_responses", 0) if updated else 0,
        "is_flagged": updated.get("is_flagged", False) if updated else False,
    }


@router.get("/", summary="List feedback records")
async def list_feedback(
    gdb_entry_id: Optional[str] = None,
    farmer_id: Optional[str] = None,
    response: Optional[str] = Query(None, regex="^(1|2)$"),
    domain: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List feedback records with optional filters."""
    query = {}
    if gdb_entry_id:
        query["gdb_entry_id"] = gdb_entry_id
    if farmer_id:
        query["farmer_id"] = farmer_id
    if response:
        query["response"] = response
    if domain:
        query["domain"] = domain

    skip = (page - 1) * limit
    total = await db.feedback.count_documents(query)
    cursor = db.feedback.find(query).sort("timestamp", -1).skip(skip).limit(limit)
    records = await cursor.to_list(limit)

    for r in records:
        if "timestamp" in r and hasattr(r["timestamp"], "isoformat"):
            r["timestamp"] = r["timestamp"].isoformat()
        r["id"] = r.pop("_id", None)

    return {"total": total, "page": page, "limit": limit, "data": records}


@router.get("/entry/{gdb_entry_id}", summary="All feedback for one GDB entry")
async def get_entry_feedback(
    gdb_entry_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Returns all feedback records for a specific GDB entry + the GDB entry details."""
    gdb_entry = await db.gdb_entries.find_one({"_id": gdb_entry_id})
    if not gdb_entry:
        raise HTTPException(status_code=404, detail="GDB entry not found")

    cursor = db.feedback.find({"gdb_entry_id": gdb_entry_id}).sort("timestamp", -1).limit(200)
    records = await cursor.to_list(200)

    for r in records:
        if "timestamp" in r and hasattr(r["timestamp"], "isoformat"):
            r["timestamp"] = r["timestamp"].isoformat()
        r["id"] = r.pop("_id", None)

    gdb_entry["id"] = gdb_entry.pop("_id")

    return {
        "gdb_entry": gdb_entry,
        "feedback_records": records,
        "total_feedback": len(records),
    }

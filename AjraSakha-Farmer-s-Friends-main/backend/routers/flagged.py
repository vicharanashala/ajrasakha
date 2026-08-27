import sys
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from shared.mongodb import get_db, FlagStatus

router = APIRouter()


class UpdateFlagStatus(BaseModel):
    status: str
    review_notes: Optional[str] = None


@router.get("/")
def get_flagged_entries(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    db = get_db()

    query = {}
    if status:
        query["status"] = status

    entries = list(
        db.flagged_entries.find(query)
        .sort("priority_score", -1)
        .skip(offset)
        .limit(limit)
    )

    return [
        {
            "id": str(e["_id"]),
            "gdb_entry_id": e["gdb_entry_id"],
            "domain": e.get("domain"),
            "language": e.get("language"),
            "total_responses": e["total_responses"],
            "helpful_count": e["helpful_count"],
            "not_helpful_count": e["not_helpful_count"],
            "helpfulness_score": e["helpfulness_score"],
            "priority_score": e["priority_score"],
            "status": e["status"],
            "flagged_at": e["flagged_at"],
            "last_feedback_at": e.get("last_feedback_at"),
            "review_notes": e.get("review_notes")
        }
        for e in entries
    ]


@router.get("/{gdb_entry_id}")
def get_flagged_entry(gdb_entry_id: str):
    db = get_db()

    entry = db.flagged_entries.find_one({"gdb_entry_id": gdb_entry_id})

    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found in flagged list")

    return {
        "id": str(entry["_id"]),
        "gdb_entry_id": entry["gdb_entry_id"],
        "domain": entry.get("domain"),
        "language": entry.get("language"),
        "total_responses": entry["total_responses"],
        "helpful_count": entry["helpful_count"],
        "not_helpful_count": entry["not_helpful_count"],
        "helpfulness_score": entry["helpfulness_score"],
        "priority_score": entry["priority_score"],
        "status": entry["status"],
        "flagged_at": entry["flagged_at"],
        "last_feedback_at": entry.get("last_feedback_at"),
        "review_notes": entry.get("review_notes")
    }


@router.patch("/{gdb_entry_id}/status")
def update_flagged_status(gdb_entry_id: str, update: UpdateFlagStatus):
    db = get_db()

    if update.status not in [s.value for s in FlagStatus]:
        raise HTTPException(status_code=400, detail="Invalid status")

    result = db.flagged_entries.update_one(
        {"gdb_entry_id": gdb_entry_id},
        {"$set": {
            "status": update.status,
            "review_notes": update.review_notes
        }}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")

    return {"message": "Status updated successfully"}


@router.delete("/{gdb_entry_id}")
def remove_from_flagged(gdb_entry_id: str):
    db = get_db()

    result = db.flagged_entries.delete_one({"gdb_entry_id": gdb_entry_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")

    return {"message": "Entry removed from flagged list"}


@router.get("/count/summary")
def get_flagged_count():
    db = get_db()

    total = db.flagged_entries.count_documents({})
    flagged = db.flagged_entries.count_documents({"status": "flagged"})
    in_review = db.flagged_entries.count_documents({"status": "in_review"})
    resolved = db.flagged_entries.count_documents({"status": "resolved"})

    return {
        "total": total,
        "flagged": flagged,
        "in_review": in_review,
        "resolved": resolved
    }
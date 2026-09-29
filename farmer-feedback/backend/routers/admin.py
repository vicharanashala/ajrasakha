import sys
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from shared.mongodb import get_db

router = APIRouter()


class ApproveRequest(BaseModel):
    answer: Optional[str] = None
    notes: Optional[str] = None
    reviewer: Optional[str] = "system"


class RejectRequest(BaseModel):
    notes: Optional[str] = None
    reviewer: Optional[str] = "system"


@router.get("/pending-entries")
def get_pending_entries():
    """Get all GDB entries pending expert review"""
    db = get_db()

    entries = list(db.gdb_entries.find({
        "status": "pending_review"
    }).sort("review_requested_at", -1))

    return [
        {
            "_id": entry["_id"],
            "question": entry.get("question", ""),
            "answer": entry.get("answer", ""),
            "ai_answer": entry.get("ai_answer", ""),
            "domain": entry.get("domain"),
            "language": entry.get("language", "English"),
            "state": entry.get("state"),
            "status": entry.get("status"),
            "source": entry.get("source", "ai_generated"),
            "generated_at": entry.get("generated_at"),
            "review_requested_at": entry.get("review_requested_at"),
            "feedback_count": entry.get("feedback_count", 0),
            "helpful_count": entry.get("helpful_count", 0),
            "not_helpful_count": entry.get("not_helpful_count", 0)
        }
        for entry in entries
    ]


@router.get("/review-requests")
def get_review_requests():
    """Get all review request notifications"""
    db = get_db()

    requests = list(db.review_requests.find({
        "status": "pending"
    }).sort("created_at", -1))

    return [
        {
            "_id": str(req["_id"]),
            "entry_id": req.get("entry_id"),
            "question": req.get("question"),
            "ai_answer": req.get("ai_answer"),
            "domain": req.get("domain"),
            "language": req.get("language"),
            "status": req.get("status"),
            "priority": req.get("priority"),
            "created_at": req.get("created_at"),
            "notified_at": req.get("notified_at")
        }
        for req in requests
    ]


@router.post("/entries/{entry_id}/approve")
def approve_entry(entry_id: str, request: ApproveRequest):
    """Approve a pending AI-generated entry and publish it to the GDB"""
    db = get_db()

    entry = db.gdb_entries.find_one({"_id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Determine the final answer
    if request.answer:
        # Expert provided custom answer
        final_answer = request.answer
    elif entry.get("ai_answer"):
        # Use the AI-generated answer (preserve the real answer, not the placeholder)
        final_answer = entry["ai_answer"]
    else:
        # Clean up placeholder text from answer field
        current_answer = entry.get("answer", "")
        if "pending expert review" in current_answer.lower() or "AI-generated" in current_answer:
            # Fallback: use the AI answer if available, otherwise keep current
            final_answer = entry.get("ai_answer", current_answer)
        else:
            final_answer = current_answer

    # Clean up the answer - remove "pending expert review" placeholder markers
    final_answer = final_answer.replace(
        "_This answer was AI-generated and pending expert review._",
        ""
    ).strip()

    update_fields = {
        "status": "approved",
        "reviewed_at": datetime.utcnow(),
        "reviewer": request.reviewer or "system",
        "review_notes": request.notes,
        "answer": final_answer,
        "final_answer": final_answer,
        "published_to_gdb": True,
        "published_at": datetime.utcnow()
    }

    db.gdb_entries.update_one(
        {"_id": entry_id},
        {"$set": update_fields}
    )

    # Update review request status
    db.review_requests.update_many(
        {"entry_id": entry_id},
        {"$set": {
            "status": "approved",
            "resolved_at": datetime.utcnow(),
            "resolver": request.reviewer
        }}
    )

    return {
        "success": True,
        "message": f"Entry {entry_id} approved and published to GDB",
        "entry_id": entry_id,
        "question": entry.get("question"),
        "answer": final_answer,
        "domain": entry.get("domain"),
        "language": entry.get("language"),
        "reviewer": request.reviewer or "system"
    }


@router.post("/entries/{entry_id}/reject")
def reject_entry(entry_id: str, request: RejectRequest):
    """Reject a pending AI-generated entry"""
    db = get_db()

    entry = db.gdb_entries.find_one({"_id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    db.gdb_entries.update_one(
        {"_id": entry_id},
        {"$set": {
            "status": "rejected",
            "reviewed_at": datetime.utcnow(),
            "reviewer": request.reviewer or "system",
            "review_notes": request.notes,
            "rejection_reason": request.notes
        }}
    )

    # Update review request status
    db.review_requests.update_many(
        {"entry_id": entry_id},
        {"$set": {
            "status": "rejected",
            "resolved_at": datetime.utcnow(),
            "resolver": request.reviewer
        }}
    )

    return {
        "success": True,
        "message": f"Entry {entry_id} rejected",
        "entry_id": entry_id
    }


@router.get("/stats")
def get_admin_stats():
    """Get admin statistics"""
    db = get_db()

    pending = db.gdb_entries.count_documents({"status": "pending_review"})
    approved = db.gdb_entries.count_documents({"status": "approved"})
    rejected = db.gdb_entries.count_documents({"status": "rejected"})
    auto_approved = db.gdb_entries.count_documents({"auto_approved": True})
    total = db.gdb_entries.count_documents({})

    return {
        "total_entries": total,
        "pending_review": pending,
        "approved": approved,
        "rejected": rejected,
        "auto_approved": auto_approved,
        "approval_rate": round((approved / total * 100), 1) if total > 0 else 0
    }
import sys
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from shared.mongodb import get_db, FeedbackResponse
from shared.utils import Config

router = APIRouter()


class FeedbackCreate(BaseModel):
    gdb_entry_id: str
    farmer_id: str
    message_id: Optional[str] = None
    response: str
    state: Optional[str] = None
    language: Optional[str] = None
    domain: Optional[str] = None


class FeedbackResponseModel(BaseModel):
    id: str
    gdb_entry_id: str
    farmer_id: str
    response: str
    state: Optional[str]
    language: Optional[str]
    domain: Optional[str]
    timestamp: datetime


@router.post("/", response_model=dict)
def create_feedback(feedback: FeedbackCreate):
    db = get_db()

    if feedback.response not in ["1", "2"]:
        raise HTTPException(status_code=400, detail="Response must be '1' (helpful) or '2' (not helpful)")

    doc = {
        "gdb_entry_id": feedback.gdb_entry_id,
        "farmer_id": feedback.farmer_id,
        "message_id": feedback.message_id,
        "response": feedback.response,
        "state": feedback.state,
        "language": feedback.language,
        "domain": feedback.domain,
        "timestamp": datetime.utcnow(),
        "status": "captured"
    }

    result = db.feedback.insert_one(doc)
    return {"id": str(result.inserted_id), "message": "Feedback recorded successfully"}


@router.get("/{gdb_entry_id}", response_model=List[FeedbackResponseModel])
def get_feedback_for_entry(gdb_entry_id: str):
    db = get_db()

    feedbacks = list(db.feedback.find({"gdb_entry_id": gdb_entry_id}).sort("timestamp", -1))

    return [
        {
            "id": str(f["_id"]),
            "gdb_entry_id": f["gdb_entry_id"],
            "farmer_id": f["farmer_id"],
            "response": f["response"],
            "state": f.get("state"),
            "language": f.get("language"),
            "domain": f.get("domain"),
            "timestamp": f["timestamp"]
        }
        for f in feedbacks
    ]


@router.get("/{gdb_entry_id}/stats")
def get_entry_stats(gdb_entry_id: str):
    db = get_db()

    total = db.feedback.count_documents({"gdb_entry_id": gdb_entry_id})

    if total == 0:
        raise HTTPException(status_code=404, detail="No feedback found for this entry")

    helpful = db.feedback.count_documents({"gdb_entry_id": gdb_entry_id, "response": "1"})
    not_helpful = db.feedback.count_documents({"gdb_entry_id": gdb_entry_id, "response": "2"})

    last_feedback = db.feedback.find_one(
        {"gdb_entry_id": gdb_entry_id},
        sort=[("timestamp", -1)]
    )

    return {
        "gdb_entry_id": gdb_entry_id,
        "total_responses": total,
        "helpful_count": helpful,
        "not_helpful_count": not_helpful,
        "helpfulness_score": round((helpful / total) * 100, 2),
        "last_feedback_at": last_feedback["timestamp"] if last_feedback else None
    }